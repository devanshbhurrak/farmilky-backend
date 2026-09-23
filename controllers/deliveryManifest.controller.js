import mongoose from "mongoose";
import DeliveryManifest from "../models/deliveryManifest.model.js";
import Subscription from "../models/subscription.model.js";
import Order from "../models/order.model.js";
import User from "../models/user.model.js";
import { calculateNextDeliveryDate, getHolidayDateSet } from "../services/scheduler.js";
import { generateManifestsForDate } from "../services/manifestService.js";

const normalizeDate = (d) => {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  return date;
};

const isValidDate = (value) => {
  const time = new Date(value).getTime();
  return !Number.isNaN(time);
};

// POST /api/manifests/generate — admin generates/refreshes manifests for a date
export const generateDailyManifests = async (req, res) => {
  try {
    const result = await generateManifestsForDate(req.body.date || undefined, { refresh: true });

    if (result.status === "invalid") {
      return res.status(400).json({ message: result.message });
    }
    if (result.status === "holiday") {
      return res.status(200).json({ message: result.message, manifests: [], unassignedCount: 0 });
    }
    if (result.status === "no_areas") {
      return res.status(400).json({ message: result.message });
    }

    res.status(201).json({
      message: result.message,
      manifests: result.manifests,
      unassignedCount: result.unassignedCount,
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
    if (!isValidDate(date)) {
      return res.status(400).json({ message: "Invalid date. Expected YYYY-MM-DD." });
    }
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
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid manifest ID." });
    }
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
    const days = Math.min(90, Math.max(1, parseInt(req.query.days || "7", 10) || 7));
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

// PUT /api/manifests/:id/resequence — admin reorders manifest entries post-generation
export const resequenceManifest = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid manifest ID." });
    }
    const { orderedEntryIds } = req.body;
    if (!Array.isArray(orderedEntryIds)) {
      return res.status(400).json({ message: "orderedEntryIds must be an array." });
    }

    const manifest = await DeliveryManifest.findById(req.params.id);
    if (!manifest) return res.status(404).json({ message: "Manifest not found." });

    const orderedSet = new Set(orderedEntryIds);
    if (orderedSet.size !== orderedEntryIds.length) {
      return res.status(400).json({ message: "Duplicate entry IDs in orderedEntryIds." });
    }

    const entryMap = {};
    for (const entry of manifest.entries) {
      entryMap[entry._id.toString()] = entry;
    }

    const reordered = [];
    for (let i = 0; i < orderedEntryIds.length; i++) {
      const entry = entryMap[orderedEntryIds[i]];
      if (!entry) return res.status(400).json({ message: `Entry ${orderedEntryIds[i]} not found in manifest.` });
      entry.sequence = i + 1;
      reordered.push(entry);
    }

    // Append any entries not in orderedEntryIds (unsequenced, at end) — O(1) lookup via Set
    for (const entry of manifest.entries) {
      if (!orderedSet.has(entry._id.toString())) {
        entry.sequence = null;
        reordered.push(entry);
      }
    }

    manifest.entries = reordered;
    await manifest.save();
    res.status(200).json({ message: "Manifest resequenced.", manifest });
  } catch (error) {
    console.error("Resequence Manifest Error:", error);
    res.status(500).json({ message: "Failed to resequence manifest." });
  }
};

// PUT /api/manifests/:id/entries/:entryId — agent updates an entry
export const updateManifestEntry = async (req, res) => {
  try {
    const { id, entryId } = req.params;
    const { status, deliveryNotes, failureReason, proofOfDelivery, paymentMode = "pay_at_delivery", subscriptionId } = req.body;
    const agentId = req.user._id;

    const VALID_ENTRY_STATUSES = ["pending", "delivered", "failed", "skipped"];
    if (status !== undefined && !VALID_ENTRY_STATUSES.includes(status)) {
      return res.status(400).json({ message: `Invalid status. Must be one of: ${VALID_ENTRY_STATUSES.join(", ")}.` });
    }

    // Admins may update any manifest; agents/delivery partners only their own
    const manifest = req.user.role === "admin"
      ? await DeliveryManifest.findById(id)
      : await DeliveryManifest.findOne({ _id: id, agentId });
    if (!manifest) return res.status(404).json({ message: "Manifest not found." });

    const holidayDates = await getHolidayDateSet();

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

        if (entry.type === "subscription") {
            const sub = await Subscription.findById(entry.referenceId);
            if (sub) {
                const manifestDate = normalizeDate(manifest.date);

                // Pre-transaction validation: check for duplicate inside a fresh read
                // to minimize (but not eliminate) the race window
                const freshSub = await Subscription.findById(sub._id).select("deliveryHistory pendingAmount totalPricePerDay quantityPerDay nextDeliveryDate userId status");
                const alreadyRecorded = freshSub.deliveryHistory.some((h) => {
                    const d = h.deliveryDate || h.date;
                    return d && normalizeDate(d).getTime() === manifestDate.getTime();
                });

                if (!alreadyRecorded) {
                    const pricePerUnit = parseFloat((freshSub.totalPricePerDay / freshSub.quantityPerDay).toFixed(2));
                    const totalAmount = freshSub.totalPricePerDay;
                    const deliveryEntry = {
                        deliveryDate: manifest.date,
                        status: "delivered",
                        scheduledQuantity: freshSub.quantityPerDay,
                        actualQuantity: freshSub.quantityPerDay,
                        pricePerUnit,
                        totalAmount,
                        notes: deliveryNotes || "Delivered via Agent App",
                        handledBy: agentId,
                        handledAt: new Date(),
                    };
                    const nextDeliveryDate = calculateNextDeliveryDate(freshSub, manifest.date, holidayDates);

                    const subSession = await mongoose.startSession();
                    try {
                      await subSession.withTransaction(async () => {
                        // Atomic: push delivery entry + $inc pendingAmount atomically
                        await Subscription.findByIdAndUpdate(freshSub._id, {
                          $push: { deliveryHistory: deliveryEntry },
                          $set: { nextDeliveryDate },
                          $inc: { pendingAmount: totalAmount },
                        }, { session: subSession });
                        await User.findByIdAndUpdate(freshSub.userId, {
                          $inc: { accountBalance: totalAmount }
                        }, { session: subSession });
                      });
                    } finally {
                      await subSession.endSession();
                    }
                }
            }
        } else if (entry.type === "order") {
            const order = await Order.findById(entry.referenceId);
            if (order && order.orderStatus !== "delivered") {
                order.orderStatus = "delivered";
                order.deliveredAt = Date.now();

                order.deliveryAttempts.push({
                    attemptDate: new Date(),
                    status: "delivered",
                    notes: deliveryNotes || "Delivered via Agent App",
                    handledBy: agentId,
                });

                // Validate subscription_ledger payment mode
                if (paymentMode === "subscription_ledger") {
                    if (!subscriptionId) {
                        entry.status = "pending"; entry.deliveredAt = undefined;
                        return res.status(400).json({ message: "subscriptionId is required for subscription_ledger payment mode." });
                    }
                    const linkedSub = await Subscription.findById(subscriptionId);
                    if (!linkedSub) {
                        entry.status = "pending"; entry.deliveredAt = undefined;
                        return res.status(404).json({ message: "Subscription not found." });
                    }
                    if (linkedSub.status !== "active") {
                        entry.status = "pending"; entry.deliveredAt = undefined;
                        return res.status(409).json({ message: "Subscription is no longer active." });
                    }
                    if (linkedSub.userId.toString() !== order.userId.toString()) {
                        entry.status = "pending"; entry.deliveredAt = undefined;
                        return res.status(403).json({ message: "Subscription does not belong to this customer." });
                    }
                    order.paymentStatus = "pending";
                    order.paymentMode = "subscription_ledger";
                    order.linkedSubscriptionId = subscriptionId;
                } else {
                    if (order.paymentMethod === "COD") order.paymentStatus = "paid";
                    order.paymentMode = "pay_at_delivery";
                }

                const orderSession = await mongoose.startSession();
                try {
                  await orderSession.withTransaction(async () => {
                    await order.save({ session: orderSession });
                    await User.findByIdAndUpdate(order.userId, {
                      $inc: { accountBalance: order.totalAmount }
                    }, { session: orderSession });
                    if (order.paymentMode === "subscription_ledger" && order.linkedSubscriptionId) {
                      await Subscription.findByIdAndUpdate(order.linkedSubscriptionId, {
                        $inc: { pendingAmount: order.totalAmount }
                      }, { session: orderSession });
                    }
                  });
                } finally {
                  await orderSession.endSession();
                }
            }
        }
    }

    // Recalculate manifest summary
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

    try {
      await manifest.save();
    } catch (saveErr) {
      // The financial transaction (subscription/order) already committed.
      // Log clearly so this partial state can be reconciled manually.
      console.error("PARTIAL COMMIT — manifest.save() failed after financial transaction committed. Entry:", entryId, "Manifest:", id, saveErr);
      return res.status(500).json({ message: "Delivery recorded but manifest status could not be updated. Please refresh." });
    }
    res.status(200).json({ message: "Entry updated.", manifest });
  } catch (error) {
    console.error("Update Entry Error:", error);
    res.status(500).json({ message: "Failed to update entry." });
  }
};
