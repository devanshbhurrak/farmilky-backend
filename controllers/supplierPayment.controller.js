import mongoose from "mongoose";
import SupplierPayment from "../models/supplierPayment.model.js";
import MilkCollection from "../models/milkCollection.model.js";
import Supplier from "../models/supplier.model.js";

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

    const from = toUTCMidnight(fromDate);
    const to = toUTCMidnight(toDate);

    // Create the payment record first
    const payment = await SupplierPayment.create({
      supplierId,
      amount: Number(amount),
      fromDate: from,
      toDate: to,
      paymentMethod: paymentMethod || "cash",
      transactionRef: transactionRef || "",
      notes: notes || "",
      recordedBy: req.user._id,
      paidAt: paidAt ? new Date(paidAt) : new Date(),
      collectionCount: 0,
    });

    // Mark qualifying confirmed collections as paid
    const updateResult = await MilkCollection.updateMany(
      {
        supplierId: new mongoose.Types.ObjectId(supplierId),
        date: { $gte: from, $lte: to },
        status: "confirmed",
        paymentId: null,
      },
      { $set: { paymentId: payment._id } }
    );

    // Update the collectionCount snapshot on the payment
    payment.collectionCount = updateResult.modifiedCount;
    await payment.save();

    res.status(201).json({
      message: `Payment recorded. ${updateResult.modifiedCount} collection(s) marked as paid.`,
      payment,
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
