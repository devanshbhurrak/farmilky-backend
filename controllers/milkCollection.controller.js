import mongoose from "mongoose";
import MilkCollection from "../models/milkCollection.model.js";
import Supplier from "../models/supplier.model.js";

// Normalize a date string or Date object to UTC midnight
function toUTCMidnight(dateInput) {
  const d = new Date(dateInput);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// Idempotently ensures pending collection entries exist for all active suppliers on a given date.
// Uses $setOnInsert so existing entries (pending or confirmed) are never overwritten.
async function ensureDailyEntries(targetDate) {
  const suppliers = await Supplier.find({ isActive: true, isDeleted: false }).select(
    "collectionSessions defaultMorningQty defaultEveningQty defaultRatePerLiter name"
  );

  if (suppliers.length === 0) return { generated: 0 };

  const ops = [];
  for (const supplier of suppliers) {
    const sessions = supplier.collectionSessions || [];
    for (const session of sessions) {
      const defaultQty =
        session === "morning" ? supplier.defaultMorningQty : supplier.defaultEveningQty;
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

  if (ops.length === 0) return { generated: 0 };

  try {
    const result = await MilkCollection.bulkWrite(ops, { ordered: false });
    return { generated: result.upsertedCount || 0 };
  } catch (err) {
    // With ordered:false, a BulkWriteError means some ops succeeded and some failed.
    // Log the failures but return partial success so the daily view still loads.
    console.error("ensureDailyEntries bulkWrite partial failure:", err?.writeErrors?.length ?? 0, "errors");
    const upserted = err?.result?.upsertedCount || 0;
    return { generated: upserted };
  }
}

// Generate today's (or a given date's) pending collection entries for all active suppliers.
export const generateDailyCollections = async (req, res) => {
  try {
    const rawDate = req.body.date || req.query.date || new Date().toISOString().split("T")[0];
    const targetDate = toUTCMidnight(rawDate);

    const { generated } = await ensureDailyEntries(targetDate);

    res.status(200).json({
      message:
        generated > 0
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

// Get all entries for a specific date (daily confirmation screen).
// Auto-generates pending entries before fetching so users never need to manually generate.
export const getDailyConfirmation = async (req, res) => {
  try {
    const rawDate = req.query.date || new Date().toISOString().split("T")[0];
    const targetDate = toUTCMidnight(rawDate);

    // Auto-generate entries (idempotent — safe to call every time).
    // Non-fatal: if generation fails, we still return any existing entries.
    try {
      await ensureDailyEntries(targetDate);
    } catch (genErr) {
      console.error("Auto-generate entries failed, continuing with existing data:", genErr);
    }

    const collections = await MilkCollection.find({ date: targetDate })
      .populate("supplierId", "name phone location defaultRatePerLiter")
      .populate("confirmedBy", "name")
      .lean();

    // Sort by supplier name, then session order
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

    res.status(200).json({
      collections,
      summary,
      date: targetDate.toISOString().split("T")[0],
    });
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
    ).populate("supplierId", "name phone").populate("confirmedBy", "name");

    if (!collection) {
      return res.status(404).json({ message: "Collection not found or already confirmed." });
    }

    await Supplier.updateOne(
      { _id: collection.supplierId._id || collection.supplierId },
      { $inc: { supplyBalance: totalAmount } }
    );

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

    // Update supplyBalance for each affected supplier
    if (result.modifiedCount > 0) {
      const balanceOps = pending.map((c) => {
        const qty = c.expectedQty || 0;
        const rate = c.ratePerLiter || 0;
        const amount = parseFloat((qty * rate).toFixed(2));
        return Supplier.updateOne(
          { _id: c.supplierId },
          { $inc: { supplyBalance: amount } }
        );
      });
      await Promise.all(balanceOps);
    }

    res.status(200).json({
      message: `Confirmed ${result.modifiedCount} collection entries.`,
      confirmed: result.modifiedCount,
    });
  } catch (error) {
    console.error("Bulk Confirm Day Error:", error);
    res.status(500).json({ message: "Failed to bulk confirm collections." });
  }
};

// Get collection history with filters and summary aggregation
export const getCollectionHistory = async (req, res) => {
  try {
    const { supplierId, from, to, status, session, page = 1, limit = 50 } = req.query;

    const filter = {};
    if (supplierId) filter.supplierId = new mongoose.Types.ObjectId(supplierId);
    if (status) filter.status = status;
    if (session) filter.session = session;
    if (from || to) {
      filter.date = {};
      if (from) filter.date.$gte = toUTCMidnight(from);
      if (to) filter.date.$lte = toUTCMidnight(to);
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [collections, total, summaryResult] = await Promise.all([
      MilkCollection.find({ ...filter })
        .populate("supplierId", "name phone")
        .populate("confirmedBy", "name")
        .sort({ date: -1, session: 1 })
        .skip(skip)
        .limit(Number(limit)),
      MilkCollection.countDocuments({ ...filter }),
      MilkCollection.aggregate([
        { $match: { ...filter } },
        {
          $group: {
            _id: null,
            totalLiters: { $sum: { $ifNull: ["$actualQty", 0] } },
            totalAmount: { $sum: { $ifNull: ["$totalAmount", 0] } },
            avgFat: { $avg: "$fatContent" },
            avgSNF: { $avg: "$snf" },
          },
        },
      ]),
    ]);

    const summary = summaryResult[0]
      ? {
          totalLiters: summaryResult[0].totalLiters || 0,
          totalAmount: summaryResult[0].totalAmount || 0,
          avgFat: summaryResult[0].avgFat != null ? parseFloat(summaryResult[0].avgFat.toFixed(2)) : null,
          avgSNF: summaryResult[0].avgSNF != null ? parseFloat(summaryResult[0].avgSNF.toFixed(2)) : null,
        }
      : { totalLiters: 0, totalAmount: 0, avgFat: null, avgSNF: null };

    res.status(200).json({ collections, total, page: Number(page), limit: Number(limit), summary });
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

    if (collection.status === "confirmed" && (actualQty !== undefined || ratePerLiter !== undefined)) {
      const oldAmount = collection.totalAmount || 0;
      updates.totalAmount = parseFloat((newQty * newRate).toFixed(2));
      await Supplier.updateOne(
        { _id: collection.supplierId },
        { $inc: { supplyBalance: updates.totalAmount - oldAmount } }
      );
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

// Find missing collection entries for a date range.
// A missing entry = an active supplier has a session with defaultQty > 0 but no MilkCollection record for that date+session.
export const getMissingCollections = async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({ message: "from and to dates are required." });
    }

    const fromDate = toUTCMidnight(from);
    const toDate = toUTCMidnight(to);

    // Build list of expected (supplierId, date, session) tuples
    const suppliers = await Supplier.find({ isActive: true, isDeleted: false }).select(
      "name collectionSessions defaultMorningQty defaultEveningQty"
    ).lean();

    // Build expected set as "supplierId|YYYY-MM-DD|session" keys for fast lookup
    const expectedList = [];
    const current = new Date(fromDate);
    while (current <= toDate) {
      // Format date as YYYY-MM-DD (UTC) — used as the Set key
      const dateKey = current.toISOString().split("T")[0];
      for (const supplier of suppliers) {
        for (const session of (supplier.collectionSessions || [])) {
          const qty = session === "morning" ? supplier.defaultMorningQty : supplier.defaultEveningQty;
          if (!qty || qty <= 0) continue;
          expectedList.push({
            supplierId: supplier._id.toString(),
            supplierName: supplier.name,
            dateKey,
            session,
          });
        }
      }
      current.setUTCDate(current.getUTCDate() + 1);
    }

    if (expectedList.length === 0) {
      return res.status(200).json({ missing: [], total: 0 });
    }

    // Fetch all existing records in the range
    const existing = await MilkCollection.find({
      date: { $gte: fromDate, $lte: toDate },
    }).select("supplierId date session").lean();

    // Normalize existing dates to UTC midnight YYYY-MM-DD strings for consistent comparison
    const existingSet = new Set(
      existing.map((c) => {
        const d = toUTCMidnight(c.date);
        const dateKey = d.toISOString().split("T")[0];
        return `${c.supplierId}|${dateKey}|${c.session}`;
      })
    );

    const missing = expectedList.filter(
      (e) => !existingSet.has(`${e.supplierId}|${e.dateKey}|${e.session}`)
    );

    res.status(200).json({
      missing: missing.map((m) => ({
        supplierId: m.supplierId,
        supplierName: m.supplierName,
        date: m.dateKey,
        session: m.session,
      })),
      total: missing.length,
    });
  } catch (error) {
    console.error("Get Missing Collections Error:", error);
    res.status(500).json({ message: "Failed to check missing collections." });
  }
};
