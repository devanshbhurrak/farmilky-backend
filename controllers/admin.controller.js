import User from "../models/user.model.js";
import Order from "../models/order.model.js";
import Subscription from "../models/subscription.model.js";
import DeliveryManifest from "../models/deliveryManifest.model.js";
import Complaint from "../models/complaint.model.js";
import Return from "../models/return.model.js";
import MilkCollection from "../models/milkCollection.model.js";

export const getAdminStats = async (req, res) => {
  try {
    const [totalUsers, totalOrders, totalOrderRevenue, activeSubscriptions, ordersToday, monthlyOrderRevenue, totalOutstanding] =
      await Promise.all([
        User.countDocuments(),
        Order.countDocuments(),
        Order.aggregate([
          { $match: { orderStatus: "delivered" } },
          { $group: { _id: null, total: { $sum: "$totalAmount" } } },
        ]),
        Subscription.countDocuments({ status: "active" }),
        Order.countDocuments({
          createdAt: {
            $gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
        }),
        Order.aggregate([
          {
            $match: {
              orderStatus: "delivered",
              createdAt: {
                $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
              },
            },
          },
          { $group: { _id: null, total: { $sum: "$totalAmount" } } },
        ]),
        User.aggregate([
          { $group: { _id: null, total: { $sum: "$accountBalance" } } },
        ]),
      ]);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    const [todaysDeliveries] = await Promise.all([
      Order.countDocuments({
        orderStatus: "delivered",
        deliveredAt: { $gte: todayStart, $lt: todayEnd },
      }),
    ]);

    res.status(200).json({
      totalUsers,
      totalOrders,
      totalRevenue: totalOrderRevenue[0]?.total || 0,
      activeSubscriptions,
      todaysDeliveries,
      pendingPayments: totalOutstanding[0]?.total || 0,
      ordersToday,
      monthlyRevenue: monthlyOrderRevenue[0]?.total || 0,
    });
  } catch (error) {
    console.error("Admin Stats Error:", error);
    res.status(500).json({ message: "Failed to fetch admin stats." });
  }
};

export const getDeliveryStats = async (req, res) => {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Monthly subscription qty delivered (delivered/partial/extra all count)
    // Supports both deliveryDate (current) and date (legacy) fields
    const [subStats] = await Subscription.aggregate([
      { $unwind: "$deliveryHistory" },
      {
        $match: {
          $and: [
            {
              $or: [
                { "deliveryHistory.deliveryDate": { $gte: monthStart } },
                {
                  "deliveryHistory.deliveryDate": { $exists: false },
                  "deliveryHistory.date": { $gte: monthStart },
                },
              ],
            },
            { "deliveryHistory.status": { $in: ["delivered", "partial", "extra"] } },
          ],
        },
      },
      {
        $group: {
          _id: null,
          qty: { $sum: "$deliveryHistory.actualQuantity" },
        },
      },
    ]);

    // Monthly milk collected from suppliers (confirmed entries only)
    const [milkStats] = await MilkCollection.aggregate([
      {
        $match: {
          date: { $gte: monthStart },
          status: "confirmed",
          actualQty: { $ne: null, $gt: 0 },
        },
      },
      { $group: { _id: null, qty: { $sum: "$actualQty" } } },
    ]);

    // Subscription deliveries are always in the product's native unit (L for milk).
    // Order item quantities are discrete counts (bottles/packs), not directly comparable,
    // so only subscription qty is returned for the delivered-volume figure.
    res.json({
      monthly: {
        deliveredQty: parseFloat((subStats?.qty || 0).toFixed(2)),
        milkQty: parseFloat((milkStats?.qty || 0).toFixed(2)),
      },
    });
  } catch (error) {
    console.error("Delivery Stats Error:", error);
    res.status(500).json({ message: "Failed to fetch delivery stats." });
  }
};

export const getDeliveryPerformance = async (req, res) => {
  try {
    const days = Math.max(1, Math.min(90, parseInt(req.query.days || "7", 10)));
    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);

    // Agent-wise performance from manifests
    const agentStats = await DeliveryManifest.aggregate([
      { $match: { date: { $gte: since }, status: "completed" } },
      {
        $group: {
          _id: "$agentId",
          totalEntries: { $sum: "$summary.total" },
          delivered: { $sum: "$summary.delivered" },
          failed: { $sum: "$summary.failed" },
          manifestCount: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "agent",
        },
      },
      { $unwind: { path: "$agent", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          agentName: "$agent.name",
          agentPhone: "$agent.phone",
          totalEntries: 1,
          delivered: 1,
          failed: 1,
          manifestCount: 1,
          successRate: {
            $cond: [
              { $gt: ["$totalEntries", 0] },
              { $multiply: [{ $divide: ["$delivered", "$totalEntries"] }, 100] },
              0,
            ],
          },
        },
      },
      { $sort: { successRate: -1 } },
    ]);

    // Area-wise performance
    const areaStats = await DeliveryManifest.aggregate([
      { $match: { date: { $gte: since } } },
      {
        $group: {
          _id: "$areaId",
          totalEntries: { $sum: "$summary.total" },
          delivered: { $sum: "$summary.delivered" },
          failed: { $sum: "$summary.failed" },
          manifestCount: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: "areas",
          localField: "_id",
          foreignField: "_id",
          as: "area",
        },
      },
      { $unwind: { path: "$area", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          areaName: "$area.name",
          totalEntries: 1,
          delivered: 1,
          failed: 1,
          manifestCount: 1,
          successRate: {
            $cond: [
              { $gt: ["$totalEntries", 0] },
              { $multiply: [{ $divide: ["$delivered", "$totalEntries"] }, 100] },
              0,
            ],
          },
        },
      },
      { $sort: { successRate: -1 } },
    ]);

    // Open complaints count
    const openComplaints = await Complaint.countDocuments({ status: "open" });
    // Pending returns count
    const pendingReturns = await Return.countDocuments({ status: "requested" });

    res.status(200).json({
      days,
      agentStats,
      areaStats,
      openComplaints,
      pendingReturns,
    });
  } catch (error) {
    console.error("Delivery Performance Error:", error);
    res.status(500).json({ message: "Failed to fetch delivery performance." });
  }
};
