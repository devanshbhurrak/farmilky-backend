import DeliveryManifest from "../models/deliveryManifest.model.js";
import Subscription from "../models/subscription.model.js";
import Order from "../models/order.model.js";
import Area from "../models/area.model.js";
import User from "../models/user.model.js";
import { isSubscriptionDueOnDate, calculateNextDeliveryDate } from "../services/scheduler.js";

const normalizeDate = (d) => {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  return date;
};

const addressToString = (addr) => {
  if (!addr) return "";
  return [addr.street, addr.city, addr.state, addr.pincode].filter(Boolean).join(", ");
};

// POST /api/manifests/generate — admin generates manifests for a date
export const generateDailyManifests = async (req, res) => {
  try {
    const targetDate = req.body.date ? normalizeDate(req.body.date) : normalizeDate(new Date());

    // Fetch all areas with assigned agents
    const areas = await Area.find({ isActive: true, assignedAgent: { $ne: null } });
    if (areas.length === 0) {
      return res.status(400).json({ message: "No active areas with assigned agents found." });
    }

    // Build pincode -> area map
    const pincodeAreaMap = {};
    for (const area of areas) {
      for (const pincode of area.pincodes) {
        pincodeAreaMap[pincode] = area;
      }
    }

    // Fetch active subscriptions due on targetDate
    const activeSubs = await Subscription.find({ status: "active" })
      .populate("userId", "name phone addresses")
      .populate("productId", "name unit price");

    const dueSubs = activeSubs.filter((sub) => isSubscriptionDueOnDate(sub, targetDate));

    // Fetch pending/confirmed orders
    const dueOrders = await Order.find({ orderStatus: { $in: ["placed", "confirmed"] } })
      .populate("userId", "name phone");

    // Group entries by area
    const areaEntries = {};
    for (const area of areas) {
      areaEntries[area._id.toString()] = [];
    }

    // Unassigned bucket (area not matched)
    const unassigned = [];

    for (const sub of dueSubs) {
      const user = sub.userId;
      const addresses = user?.addresses || [];
      const defaultAddr = addresses.find((a) => a.isDefault) || addresses[0];
      const pincode = defaultAddr?.pincode || "";
      const matchedArea = pincodeAreaMap[pincode];
      const entry = {
        type: "subscription",
        referenceId: sub._id,
        customerName: user?.name || "Unknown",
        phone: user?.phone || "",
        address: addressToString(defaultAddr),
        productLabel: `${sub.productId?.name} (${sub.quantityPerDay} ${sub.productId?.unit})`,
        quantity: sub.quantityPerDay,
        unit: sub.productId?.unit || "unit",
        amount: sub.totalPricePerDay || 0,
        status: "pending",
      };
      if (matchedArea) {
        areaEntries[matchedArea._id.toString()].push(entry);
      } else {
        unassigned.push(entry);
      }
    }

    for (const order of dueOrders) {
      const user = order.userId;
      const addr = order.address;
      const pincode = addr?.pincode || "";
      const matchedArea = pincodeAreaMap[pincode];
      const entry = {
        type: "order",
        referenceId: order._id,
        customerName: user?.name || "Unknown",
        phone: user?.phone || "",
        address: addressToString(addr),
        productLabel: order.items.map((i) => `${i.name} x${i.quantity}`).join(", "),
        quantity: order.items.reduce((s, i) => s + i.quantity, 0),
        unit: "items",
        amount: order.totalAmount,
        status: "pending",
      };
      if (matchedArea) {
        areaEntries[matchedArea._id.toString()].push(entry);
      } else {
        unassigned.push(entry);
      }
    }

    const createdManifests = [];

    for (const area of areas) {
      const entries = areaEntries[area._id.toString()];
      if (entries.length === 0) continue;

      // Check if manifest already exists for this area+date
      const existing = await DeliveryManifest.findOne({ date: targetDate, areaId: area._id });
      if (existing) {
        createdManifests.push(existing);
        continue;
      }

      const manifest = await DeliveryManifest.create({
        date: targetDate,
        agentId: area.assignedAgent,
        areaId: area._id,
        entries,
        summary: {
          total: entries.length,
          delivered: 0,
          failed: 0,
          pending: entries.length,
        },
        status: "active",
      });
      createdManifests.push(manifest);
    }

    res.status(201).json({
      message: `Generated ${createdManifests.length} manifests for ${targetDate.toDateString()}.`,
      manifests: createdManifests,
      unassignedCount: unassigned.length,
    });
  } catch (error) {
    console.error("Generate Manifests Error:", error);
    res.status(500).json({ message: "Failed to generate manifests." });
  }
};

// GET /api/manifests?date=YYYY-MM-DD — admin view all manifests for a date
export const getManifestsByDate = async (req, res) => {
  try {
    const date = req.query.date ? normalizeDate(req.query.date) : normalizeDate(new Date());
    const manifests = await DeliveryManifest.find({ date })
      .populate("agentId", "name phone email")
      .populate("areaId", "name localities");
    res.status(200).json({ count: manifests.length, manifests });
  } catch (error) {
    console.error("Get Manifests Error:", error);
    res.status(500).json({ message: "Failed to fetch manifests." });
  }
};

// GET /api/manifests/:id — full manifest detail
export const getManifestById = async (req, res) => {
  try {
    const manifest = await DeliveryManifest.findById(req.params.id)
      .populate("agentId", "name phone email")
      .populate("areaId", "name localities");
    if (!manifest) return res.status(404).json({ message: "Manifest not found." });
    res.status(200).json({ manifest });
  } catch (error) {
    console.error("Get Manifest By ID Error:", error);
    res.status(500).json({ message: "Failed to fetch manifest." });
  }
};

// GET /api/manifests/my/today — delivery partner gets their manifest for today
export const getMyTodayManifest = async (req, res) => {
  try {
    const agentId = req.user._id;
    const today = normalizeDate(new Date());
    const manifest = await DeliveryManifest.findOne({ agentId, date: today })
      .populate("areaId", "name localities");
    if (!manifest) return res.status(404).json({ message: "No manifest assigned for today." });
    res.status(200).json({ manifest });
  } catch (error) {
    console.error("Get My Manifest Error:", error);
    res.status(500).json({ message: "Failed to fetch manifest." });
  }
};

// GET /api/manifests/my/history — delivery partner recent manifests
export const getMyManifestHistory = async (req, res) => {
  try {
    const agentId = req.user._id;
    const days = parseInt(req.query.days || "7", 10);
    const since = normalizeDate(new Date());
    since.setDate(since.getDate() - days);
    const manifests = await DeliveryManifest.find({ agentId, date: { $gte: since } })
      .sort({ date: -1 });
    res.status(200).json({ count: manifests.length, manifests });
  } catch (error) {
    console.error("Get My History Error:", error);
    res.status(500).json({ message: "Failed to fetch manifest history." });
  }
};

// PUT /api/manifests/:id/entries/:entryId — agent updates an entry
export const updateManifestEntry = async (req, res) => {
  try {
    const { id, entryId } = req.params;
    const { status, deliveryNotes, failureReason, proofOfDelivery } = req.body;
    const agentId = req.user._id;

    const manifest = await DeliveryManifest.findOne({ _id: id, agentId });
    if (!manifest) return res.status(404).json({ message: "Manifest not found." });

    const entry = manifest.entries.id(entryId);
    if (!entry) return res.status(404).json({ message: "Entry not found." });

    if (entry.status !== "pending") {
      return res.status(400).json({ message: "Only pending entries can be updated." });
    }

    if (status) entry.status = status;
    if (deliveryNotes !== undefined) entry.deliveryNotes = deliveryNotes;
    if (failureReason !== undefined) entry.failureReason = failureReason;
    if (proofOfDelivery !== undefined) entry.proofOfDelivery = proofOfDelivery;
    
    if (status === "delivered") {
        entry.deliveredAt = new Date();
        
        // --- VIRTUAL PASSBOOK INTEGRATION ---
        
        if (entry.type === "subscription") {
            const sub = await Subscription.findById(entry.referenceId);
            if (sub) {
                const deliveryEntry = {
                    deliveryDate: manifest.date,
                    status: "delivered",
                    scheduledQuantity: sub.quantityPerDay,
                    actualQuantity: sub.quantityPerDay,
                    pricePerUnit: sub.totalPricePerDay / sub.quantityPerDay,
                    totalAmount: sub.totalPricePerDay,
                    notes: deliveryNotes || "Delivered via Agent App",
                    handledBy: agentId,
                    handledAt: new Date(),
                };
                sub.deliveryHistory.push(deliveryEntry);
                sub.pendingAmount += sub.totalPricePerDay;
                sub.nextDeliveryDate = calculateNextDeliveryDate(sub, manifest.date);
                await sub.save();

                // Increment User Balance (Debit)
                await User.findByIdAndUpdate(sub.userId, {
                    $inc: { accountBalance: sub.totalPricePerDay }
                });
            }
        } else if (entry.type === "order") {
            const order = await Order.findById(entry.referenceId);
            if (order && order.orderStatus !== "delivered") {
                order.orderStatus = "delivered";
                order.deliveredAt = Date.now();
                if (order.paymentMethod === "COD") order.paymentStatus = "paid";
                
                order.deliveryAttempts.push({
                    attemptDate: new Date(),
                    status: "delivered",
                    notes: deliveryNotes || "Delivered via Agent App",
                    handledBy: agentId,
                });
                await order.save();

                // Increment User Balance (Debit)
                await User.findByIdAndUpdate(order.userId, {
                    $inc: { accountBalance: order.totalAmount }
                });
            }
        }
    }

    // Recalculate summary
    const counts = manifest.entries.reduce(
      (acc, e) => {
        acc[e.status] = (acc[e.status] || 0) + 1;
        return acc;
      },
      { pending: 0, delivered: 0, failed: 0, skipped: 0 }
    );
    manifest.summary = {
      total: manifest.entries.length,
      delivered: counts.delivered,
      failed: counts.failed,
      pending: counts.pending,
    };

    if (counts.pending === 0) manifest.status = "completed";

    await manifest.save();
    res.status(200).json({ message: "Entry updated.", manifest });
  } catch (error) {
    console.error("Update Entry Error:", error);
    res.status(500).json({ message: "Failed to update entry." });
  }
};
