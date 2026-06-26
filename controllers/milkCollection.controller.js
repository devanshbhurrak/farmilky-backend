import mongoose from "mongoose";
import MilkCollection from "../models/milkCollection.model.js";
import Supplier from "../models/supplier.model.js";

// Normalize a date string or Date object to UTC midnight
function toUTCMidnight(dateInput) {
  const d = new Date(dateInput);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// Generate today's (or a given date's) pending collection entries for all active suppliers.
// Idempotent: uses $setOnInsert so existing entries are never overwritten.
export const generateDailyCollections = async (req, res) => {
  try {
    const rawDate = req.body.date || req.query.date || new Date().toISOString().split("T")[0];
    const targetDate = toUTCMidnight(rawDate);

    const suppliers = await Supplier.find({ isActive: true, isDeleted: false })
      .select("collectionSessions defaultMorningQty defaultEveningQty defaultRatePerLiter name");

    if (suppliers.length === 0) {
      return res.status(200).json({ message: "No active suppliers found.", generated: 0 });
    }

    const ops = [];
    for (const supplier of suppliers) {
      const sessions = supplier.collectionSessions || [];
      for (const session of sessions) {
        const defaultQty =
          session === "morning" ? supplier.defaultMorningQty : supplier.defaultEveningQty;

        // Skip sessions with 0 expected quantity
        if (!defaultQty || defaultQty <= 0) continue;

        ops.push({
          updateOne: {
            filter: { supplierId: supplier._id, date: targetDate, session },
            update: {
              $setOnInsert: {
                supplierId: supplier._id,
                date: targetDate,
                session,
                expectedQty: defaultQty,
                ratePerLiter: supplier.defaultRatePerLiter || 0,
                status: "pending",
                actualQty: null,
                fatContent: null,
                snf: null,
                totalAmount: null,
                paymentId: null,
                confirmedBy: null,
                confirmedAt: null,
                notes: "",
              },
            },
            upsert: true,
          },
        });
      }
    }

    if (ops.length === 0) {
      return res.status(200).json({ message: "No sessions with non-zero quantity to generate.", generated: 0 });
    }

    const result = await MilkCollection.bulkWrite(ops, { ordered: false });
    const generated = result.upsertedCount || 0;

    res.status(200).json({
      message: generated > 0
        ? `Generated ${generated} collection entries.`
        : "Entries already exist for this date — no changes made.",
      generated,
      date: targetDate.toISOString().split("T")[0],
    });
  } catch (error) {
    console.error("Generate Daily Collections Error:", error);
    res.status(500).json({ message: "Failed to generate daily collections." });
  }
};

// Get all entries for a specific date (daily confirmation screen)
export const getDailyConfirmation = async (req, res) => {
  try {
    const rawDate = req.query.date || new Date().toISOString().split("T")[0];
    const targetDate = toUTCMidnight(rawDate);

    const collections = await MilkCollection.find({ date: targetDate })
      .populate("supplierId", "name phone location defaultRatePerLiter")
      .populate("confirmedBy", "name")
      .lean();

    // Sort in JS — populated fields can't be used in DB-level sort
    collections.sort((a, b) => {
      const nameA = (a.supplierId?.name || "").toLowerCase();
      const nameB = (b.supplierId?.name || "").toLowerCase();
      if (nameA !== nameB) return nameA.localeCompare(nameB);
      const sessionOrder = { morning: 0, evening: 1 };
      return (sessionOrder[a.session] ?? 0) - (sessionOrder[b.session] ?? 0);
    });

    const summary = {
      total: collections.length,
      pending: collections.filter((c) => c.status === "pending").length,
      confirmed: collections.filter((c) => c.status === "confirmed").length,
      totalLiters: collections
        .filter((c) => c.status === "confirmed")
        .reduce((sum, c) => sum + (c.actualQty || 0), 0),
      totalAmount: collections
        .filter((c) => c.status === "confirmed")
        .reduce((sum, c) => sum + (c.totalAmount || 0), 0),
    };

    res.status(200).json({ collections, summary, date: targetDate.toISOString().split("T")[0] });
  } catch (error) {
    console.error("Get Daily Confirmation Error:", error);
    res.status(500).json({ message: "Failed to fetch daily collections." });
  }
};

// Confirm a single collection entry
export const confirmCollection = async (req, res) => {
  try {
    const { id } = req.params;
    const { actualQty, ratePerLiter, fatContent, snf, notes } = req.body;

    if (actualQty === undefined || actualQty === null || actualQty < 0) {
      return res.status(400).json({ message: "Actual quantity is required and must be non-negative." });
    }
    if (!ratePerLiter && ratePerLiter !== 0) {
      return res.status(400).json({ message: "Rate per liter is required." });
    }

    const totalAmount = parseFloat((actualQty * ratePerLiter).toFixed(2));

    const collection = await MilkCollection.findOneAndUpdate(
      { _id: id, status: "pending" },
      {
        $set: {
          actualQty: Number(actualQty),
          ratePerLiter: Number(ratePerLiter),
          totalAmount,
          ...(fatContent !== undefined && { fatContent: fatContent !== null ? Number(fatContent) : null }),
          ...(snf !== undefined && { snf: snf !== null ? Number(snf) : null }),
          ...(notes !== undefined && { notes }),
          status: "confirmed",
          confirmedBy: req.user._id,
          confirmedAt: new Date(),
        },
      },
      { new: true, runValidators: true }
    ).populate("supplierId", "name phone");

    if (!collection) {
      return res.status(404).json({ message: "Collection not found or already confirmed." });
    }

    res.status(200).json({ message: "Collection confirmed.", collection });
  } catch (error) {
    console.error("Confirm Collection Error:", error);
    res.status(500).json({ message: "Failed to confirm collection." });
  }
};

// Bulk-confirm all pending entries for a date using their expected qty and pre-set rate
export const bulkConfirmDay = async (req, res) => {
  try {
    const rawDate = req.body.date || req.query.date || new Date().toISOString().split("T")[0];
    const targetDate = toUTCMidnight(rawDate);

    const pending = await MilkCollection.find({ date: targetDate, status: "pending" });

    if (pending.length === 0) {
      return res.status(200).json({ message: "No pending entries for this date.", confirmed: 0 });
    }

    const now = new Date();
    const bulkOps = pending.map((c) => {
      const qty = c.expectedQty || 0;
      const rate = c.ratePerLiter || 0;
      return {
        updateOne: {
          filter: { _id: c._id, status: "pending" },
          update: {
            $set: {
              actualQty: qty,
              totalAmount: parseFloat((qty * rate).toFixed(2)),
              status: "confirmed",
              confirmedBy: req.user._id,
              confirmedAt: now,
            },
          },
        },
      };
    });

    const result = await MilkCollection.bulkWrite(bulkOps);
    res.status(200).json({
      message: `Confirmed ${result.modifiedCount} collection entries.`,
      confirmed: result.modifiedCount,
    });
  } catch (error) {
    console.error("Bulk Confirm Day Error:", error);
    res.status(500).json({ message: "Failed to bulk confirm collections." });
  }
};

// Get collection history with filters
export const getCollectionHistory = async (req, res) => {
  try {
    const { supplierId, from, to, status, page = 1, limit = 50 } = req.query;

    const filter = {};
    if (supplierId) filter.supplierId = new mongoose.Types.ObjectId(supplierId);
    if (status) filter.status = status;
    if (from || to) {
      filter.date = {};
      if (from) filter.date.$gte = toUTCMidnight(from);
      if (to) filter.date.$lte = toUTCMidnight(to);
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [collections, total] = await Promise.all([
      MilkCollection.find(filter)
        .populate("supplierId", "name phone")
        .populate("confirmedBy", "name")
        .sort({ date: -1, session: 1 })
        .skip(skip)
        .limit(Number(limit)),
      MilkCollection.countDocuments(filter),
    ]);

    res.status(200).json({ collections, total, page: Number(page), limit: Number(limit) });
  } catch (error) {
    console.error("Get Collection History Error:", error);
    res.status(500).json({ message: "Failed to fetch collection history." });
  }
};

// Admin correction of a confirmed entry (recalculates totalAmount)
export const updateCollection = async (req, res) => {
  try {
    const { id } = req.params;
    const { actualQty, ratePerLiter, fatContent, snf, notes } = req.body;

    const collection = await MilkCollection.findById(id);
    if (!collection) {
      return res.status(404).json({ message: "Collection not found." });
    }

    const newQty = actualQty !== undefined ? Number(actualQty) : collection.actualQty;
    const newRate = ratePerLiter !== undefined ? Number(ratePerLiter) : collection.ratePerLiter;

    const updates = {
      ...(actualQty !== undefined && { actualQty: newQty }),
      ...(ratePerLiter !== undefined && { ratePerLiter: newRate }),
      ...(fatContent !== undefined && { fatContent: fatContent !== null ? Number(fatContent) : null }),
      ...(snf !== undefined && { snf: snf !== null ? Number(snf) : null }),
      ...(notes !== undefined && { notes }),
    };

    // Recalculate totalAmount if qty or rate changed and entry is confirmed
    if (collection.status === "confirmed" && (actualQty !== undefined || ratePerLiter !== undefined)) {
      updates.totalAmount = parseFloat((newQty * newRate).toFixed(2));
    }

    const updated = await MilkCollection.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    ).populate("supplierId", "name phone");

    res.status(200).json({ message: "Collection updated.", collection: updated });
  } catch (error) {
    console.error("Update Collection Error:", error);
    res.status(500).json({ message: "Failed to update collection." });
  }
};
