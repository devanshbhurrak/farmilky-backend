import mongoose from "mongoose";
import SupplierPayment from "../models/supplierPayment.model.js";
import MilkCollection from "../models/milkCollection.model.js";
import Supplier from "../models/supplier.model.js";
import SupplierAdjustment from "../models/supplierAdjustment.model.js";

function toUTCMidnight(dateInput) {
  const d = new Date(dateInput);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// Get outstanding (unpaid) totals grouped by supplier
export const getOutstandingBySupplier = async (req, res) => {
  try {
    const outstanding = await MilkCollection.aggregate([
      { $match: { status: "confirmed", paymentId: null } },
      {
        $group: {
          _id: "$supplierId",
          outstandingAmount: { $sum: "$totalAmount" },
          collectionCount: { $sum: 1 },
          earliestDate: { $min: "$date" },
        },
      },
      {
        $lookup: {
          from: "suppliers",
          localField: "_id",
          foreignField: "_id",
          as: "supplier",
        },
      },
      { $unwind: "$supplier" },
      {
        $project: {
          _id: 0,
          supplierId: "$_id",
          supplierName: "$supplier.name",
          supplierPhone: "$supplier.phone",
          outstandingAmount: 1,
          collectionCount: 1,
          earliestDate: 1,
        },
      },
      { $sort: { outstandingAmount: -1 } },
    ]);

    res.status(200).json({ outstanding });
  } catch (error) {
    console.error("Get Outstanding Error:", error);
    res.status(500).json({ message: "Failed to fetch outstanding amounts." });
  }
};

// Get collection + passbook adjustment totals for a date range (used by payment modal preview)
export const getCollectionTotalForPeriod = async (req, res) => {
  try {
    const { supplierId, from: fromDate, to: toDate } = req.query;

    if (!supplierId || !fromDate || !toDate) {
      return res.status(400).json({ message: "supplierId, from, and to are required." });
    }

    const from = toUTCMidnight(fromDate);
    const to = toUTCMidnight(toDate);
    const supplierObjId = new mongoose.Types.ObjectId(supplierId);

    const [collectionResult, adjResult] = await Promise.all([
      MilkCollection.aggregate([
        {
          $match: {
            supplierId: supplierObjId,
            date: { $gte: from, $lte: to },
            status: "confirmed",
            paymentId: null,
          },
        },
        {
          $group: {
            _id: null,
            collectionTotal: { $sum: "$totalAmount" },
            collectionCount: { $sum: 1 },
          },
        },
      ]),
      // Filter adjustments by the user-selected transaction `date`, not createdAt
      SupplierAdjustment.aggregate([
        {
          $match: {
            supplierId: supplierObjId,
            date: { $gte: from, $lte: to },
            paymentId: null,
          },
        },
        {
          $group: {
            _id: null,
            creditTotal: {
              $sum: { $cond: [{ $eq: ["$type", "credit"] }, "$amount", 0] },
            },
            debitTotal: {
              $sum: { $cond: [{ $eq: ["$type", "debit"] }, "$amount", 0] },
            },
            adjustmentCount: { $sum: 1 },
          },
        },
      ]),
    ]);

    const collections = collectionResult[0] || { collectionTotal: 0, collectionCount: 0 };
    const adjs = adjResult[0] || { creditTotal: 0, debitTotal: 0, adjustmentCount: 0 };

    const collectionTotal = parseFloat(collections.collectionTotal.toFixed(2));
    // Net adjustment: credits increase what we owe the supplier, debits decrease it
    const adjustmentNet = parseFloat((adjs.creditTotal - adjs.debitTotal).toFixed(2));
    const grandTotal = parseFloat((collectionTotal + adjustmentNet).toFixed(2));

    res.status(200).json({
      collectionTotal,
      collectionCount: collections.collectionCount,
      adjustmentNet,
      adjustmentCreditTotal: parseFloat(adjs.creditTotal.toFixed(2)),
      adjustmentDebitTotal: parseFloat(adjs.debitTotal.toFixed(2)),
      adjustmentCount: adjs.adjustmentCount,
      grandTotal,
    });
  } catch (error) {
    console.error("Get Collection Total Error:", error);
    res.status(500).json({ message: "Failed to fetch collection total." });
  }
};

// Record a payment for a supplier and mark covered collections as paid
export const recordPayment = async (req, res) => {
  try {
    const {
      supplierId, amount, fromDate, toDate,
      paymentMethod, transactionRef, notes, paidAt,
    } = req.body;

    if (!supplierId || !amount || !fromDate || !toDate) {
      return res.status(400).json({ message: "Supplier, amount, fromDate, and toDate are required." });
    }

    const supplier = await Supplier.findOne({ _id: supplierId, isDeleted: false });
    if (!supplier) {
      return res.status(404).json({ message: "Supplier not found." });
    }

    const paymentAmount = Number(amount);
    const from = toUTCMidnight(fromDate);
    const to = toUTCMidnight(toDate);

    const session = await mongoose.startSession();
    let payment, collectionTotal, adjustment = null, modifiedCount = 0;
    let settledAdjustmentCount = 0, adjustmentNet = 0;

    try {
      await session.withTransaction(async () => {
        // Create the payment record
        [payment] = await SupplierPayment.create([{
          supplierId,
          amount: paymentAmount,
          fromDate: from,
          toDate: to,
          paymentMethod: paymentMethod || "cash",
          transactionRef: transactionRef || "",
          notes: notes || "",
          recordedBy: req.user._id,
          paidAt: paidAt ? new Date(paidAt) : new Date(),
          collectionCount: 0,
          collectionTotal: 0,
        }], { session });

        // Mark qualifying confirmed collections as paid
        const updateResult = await MilkCollection.updateMany(
          {
            supplierId: new mongoose.Types.ObjectId(supplierId),
            date: { $gte: from, $lte: to },
            status: "confirmed",
            paymentId: null,
          },
          { $set: { paymentId: payment._id } },
          { session }
        );
        modifiedCount = updateResult.modifiedCount;

        // Compute the total of collections just marked as paid
        const totalResult = await MilkCollection.aggregate([
          { $match: { paymentId: payment._id } },
          { $group: { _id: null, total: { $sum: "$totalAmount" } } },
        ]).session(session);
        collectionTotal = parseFloat((totalResult[0]?.total || 0).toFixed(2));

        // Update payment snapshot
        payment.collectionCount = modifiedCount;
        payment.collectionTotal = collectionTotal;
        await payment.save({ session });

        // Decrement supplyBalance by collection total
        if (collectionTotal > 0) {
          await Supplier.updateOne(
            { _id: supplierId },
            { $inc: { supplyBalance: -collectionTotal } },
            { session }
          );
        }

        // Settle passbook adjustments in the date range.
        // Filter by the user-selected transaction `date` field, not createdAt.
        const pendingAdjustments = await SupplierAdjustment.find(
          {
            supplierId: new mongoose.Types.ObjectId(supplierId),
            date: { $gte: from, $lte: to },
            paymentId: null,
          },
          null,
          { session }
        ).lean();

        if (pendingAdjustments.length > 0) {
          const adjIds = pendingAdjustments.map((a) => a._id);
          await SupplierAdjustment.updateMany(
            { _id: { $in: adjIds } },
            { $set: { paymentId: payment._id } },
            { session }
          );

          let creditTotal = 0, debitTotal = 0;
          pendingAdjustments.forEach((a) => {
            if (a.type === "credit") creditTotal += a.amount;
            else debitTotal += a.amount;
          });

          adjustmentNet = parseFloat((creditTotal - debitTotal).toFixed(2));
          settledAdjustmentCount = pendingAdjustments.length;

          // Reverse their effect on passbookBalance since they are now settled
          // (credits had added to passbookBalance; debits had subtracted — undo both)
          const passbookReversal = parseFloat((debitTotal - creditTotal).toFixed(2));
          if (Math.abs(passbookReversal) > 0.001) {
            await Supplier.updateOne(
              { _id: supplierId },
              { $inc: { passbookBalance: passbookReversal } },
              { session }
            );
          }
        }

        // Handle payment difference vs (collections + adjustments) → auto-create passbook entry
        const expectedTotal = parseFloat((collectionTotal + adjustmentNet).toFixed(2));
        const diff = parseFloat((paymentAmount - expectedTotal).toFixed(2));

        if (Math.abs(diff) > 0.01) {
          const adjType = diff > 0 ? "debit" : "credit";
          const adjAmount = parseFloat(Math.abs(diff).toFixed(2));

          [adjustment] = await SupplierAdjustment.create([{
            supplierId,
            type: adjType,
            category: "payment_difference",
            amount: adjAmount,
            date: paidAt ? new Date(paidAt) : new Date(),
            description: adjustmentNet !== 0
              ? `Payment difference: paid ₹${paymentAmount} against ₹${expectedTotal} expected (₹${collectionTotal} collections + ₹${adjustmentNet} passbook)`
              : `Payment difference: paid ₹${paymentAmount} against ₹${collectionTotal} collections`,
            notes: "",
            recordedBy: req.user._id,
            paymentId: payment._id,
          }], { session });

          const passbookDelta = adjType === "credit" ? adjAmount : -adjAmount;
          await Supplier.updateOne(
            { _id: supplierId },
            { $inc: { passbookBalance: passbookDelta } },
            { session }
          );
        }
      });
    } finally {
      await session.endSession();
    }

    let message = `Payment recorded. ${modifiedCount} collection(s) marked as paid.`;
    if (settledAdjustmentCount > 0) {
      message += ` ${settledAdjustmentCount} passbook adjustment(s) settled.`;
    }

    res.status(201).json({
      message,
      payment,
      collectionTotal,
      adjustmentNet,
      settledAdjustmentCount,
      adjustment,
    });
  } catch (error) {
    console.error("Record Payment Error:", error);
    res.status(500).json({ message: "Failed to record payment." });
  }
};

// Get payment history for a specific supplier
export const getPaymentHistory = async (req, res) => {
  try {
    const { supplierId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const supplier = await Supplier.findOne({ _id: supplierId, isDeleted: false }).select("name phone");
    if (!supplier) {
      return res.status(404).json({ message: "Supplier not found." });
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [payments, total] = await Promise.all([
      SupplierPayment.find({ supplierId })
        .populate("recordedBy", "name")
        .sort({ paidAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      SupplierPayment.countDocuments({ supplierId }),
    ]);

    res.status(200).json({ payments, supplier, total, page: Number(page), limit: Number(limit) });
  } catch (error) {
    console.error("Get Payment History Error:", error);
    res.status(500).json({ message: "Failed to fetch payment history." });
  }
};
