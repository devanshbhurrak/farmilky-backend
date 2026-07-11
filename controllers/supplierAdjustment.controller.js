import mongoose from "mongoose";
import Supplier from "../models/supplier.model.js";
import SupplierAdjustment from "../models/supplierAdjustment.model.js";

export const getSupplierPassbook = async (req, res) => {
  try {
    const { supplierId } = req.params;
    const { month, year } = req.query;

    const supplier = await Supplier.findOne({ _id: supplierId, isDeleted: false })
      .select("name phone supplyBalance passbookBalance");
    if (!supplier) return res.status(404).json({ message: "Supplier not found." });

    const filter = { supplierId: new mongoose.Types.ObjectId(supplierId) };

    if (month && year) {
      const targetMonth = parseInt(month) - 1;
      const targetYear = parseInt(year);
      const start = new Date(Date.UTC(targetYear, targetMonth, 1));
      const end = new Date(Date.UTC(targetYear, targetMonth + 1, 1));
      filter.date = { $gte: start, $lt: end };
    }

    const adjustments = await SupplierAdjustment.find(filter)
      .populate("recordedBy", "name")
      .sort({ date: -1, createdAt: -1 })
      .lean();

    const entries = adjustments.map((a) => ({
      _id: a._id,
      date: a.date,
      type: a.type,
      amount: a.amount,
      description: a.description,
      notes: a.notes || "",
      category: a.category,
      recordedBy: a.recordedBy?.name,
      paymentId: a.paymentId || null,
      isAuto: !!a.paymentId,
      createdAt: a.createdAt,
    }));

    res.status(200).json({
      supplier: {
        _id: supplier._id,
        name: supplier.name,
        phone: supplier.phone,
        supplyBalance: supplier.supplyBalance,
        passbookBalance: supplier.passbookBalance,
        outstandingAmount: supplier.supplyBalance + supplier.passbookBalance,
      },
      entries,
    });
  } catch (error) {
    console.error("Get Supplier Passbook Error:", error);
    res.status(500).json({ message: "Failed to fetch supplier passbook." });
  }
};

export const createAdjustment = async (req, res) => {
  try {
    const { supplierId } = req.params;
    const { type, category, amount, date, description, notes } = req.body;

    if (!type || !category || !amount || !date || !description) {
      return res.status(400).json({ message: "Type, category, amount, date, and description are required." });
    }

    const supplier = await Supplier.findOne({ _id: supplierId, isDeleted: false });
    if (!supplier) return res.status(404).json({ message: "Supplier not found." });

    const adjustment = await SupplierAdjustment.create({
      supplierId,
      type,
      category,
      amount: Number(amount),
      date: new Date(date),
      description,
      notes: notes || "",
      recordedBy: req.user._id,
    });

    const balanceDelta = type === "credit" ? Number(amount) : -Number(amount);
    await Supplier.updateOne({ _id: supplierId }, { $inc: { passbookBalance: balanceDelta } });

    res.status(201).json({ message: "Adjustment recorded.", adjustment });
  } catch (error) {
    console.error("Create Adjustment Error:", error);
    res.status(500).json({ message: "Failed to record adjustment." });
  }
};

export const deleteAdjustment = async (req, res) => {
  try {
    const { supplierId, id } = req.params;

    const adjustment = await SupplierAdjustment.findOne({ _id: id, supplierId });
    if (!adjustment) return res.status(404).json({ message: "Adjustment not found." });

    if (adjustment.paymentId) {
      return res.status(400).json({ message: "Cannot delete auto-created payment adjustments." });
    }

    const reverseDelta = adjustment.type === "credit" ? -adjustment.amount : adjustment.amount;
    await Supplier.updateOne({ _id: supplierId }, { $inc: { passbookBalance: reverseDelta } });
    await adjustment.deleteOne();

    res.status(200).json({ message: "Adjustment deleted." });
  } catch (error) {
    console.error("Delete Adjustment Error:", error);
    res.status(500).json({ message: "Failed to delete adjustment." });
  }
};
