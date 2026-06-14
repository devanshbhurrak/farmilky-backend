import Subscription from "../models/subscription.model.js";
import Order from "../models/order.model.js";
import Payment from "../models/payment.model.js";
import User from "../models/user.model.js";

export const getCustomerPassbook = async (req, res) => {
  try {
    const { userId } = req.params;
    const { month, year } = req.query; // Optional filters

    const user = await User.findById(userId).select("name accountBalance");
    if (!user) return res.status(404).json({ message: "User not found" });

    // 1. Fetch Subscriptions & Extract Deliveries (Debits)
    const subscriptions = await Subscription.find({ userId })
      .populate("productId", "name unit")
      .lean();
    
    const deliveryEntries = [];
    subscriptions.forEach(sub => {
      sub.deliveryHistory.forEach(entry => {
        if (["delivered", "extra", "partial"].includes(entry.status)) {
          deliveryEntries.push({
            date: entry.deliveryDate || entry.date,
            type: "debit",
            amount: entry.totalAmount,
            description: `${sub.productId?.name || "Product"} Delivery`,
            notes: `${entry.status}${entry.notes ? ` - ${entry.notes}` : ""}`,
            referenceId: sub._id,
            category: "Subscription"
          });
        }
      });
    });

    // 2. Fetch Orders (Debits)
    const orders = await Order.find({ userId, orderStatus: "delivered" }).lean();
    const orderEntries = orders.map(order => ({
      date: order.deliveredAt || order.createdAt,
      type: "debit",
      amount: order.totalAmount,
      description: `Order #${order._id.toString().slice(-6).toUpperCase()}`,
      notes: order.items.map(i => `${i.name} x${i.quantity}`).join(", "),
      referenceId: order._id,
      category: "Order"
    }));

    // 3. Fetch Payments (Credits)
    const payments = await Payment.find({ userId })
      .populate("recordedBy", "name")
      .lean();
    
    const paymentEntries = payments.map(pay => ({
      date: pay.date,
      type: "credit",
      amount: pay.amount,
      description: "Payment Received",
      notes: pay.notes || pay.transactionId || "",
      recordedBy: pay.recordedBy?.name,
      referenceId: pay._id,
      category: "Payment"
    }));

    // 4. Merge & Sort
    let allEntries = [...deliveryEntries, ...orderEntries, ...paymentEntries];

    // Optional Filter by Month/Year
    if (month && year) {
      const targetMonth = parseInt(month) - 1;
      const targetYear = parseInt(year);
      allEntries = allEntries.filter(e => {
        const d = new Date(e.date);
        return d.getMonth() === targetMonth && d.getFullYear() === targetYear;
      });
    }

    allEntries.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.status(200).json({
      user,
      entries: allEntries
    });
  } catch (error) {
    console.error("Get Customer Passbook Error:", error);
    res.status(500).json({ message: "Failed to fetch passbook entries." });
  }
};

export const getMyPassbook = async (req, res) => {
    req.params.userId = req.user._id;
    return getCustomerPassbook(req, res);
};
