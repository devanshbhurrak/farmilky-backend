import mongoose from "mongoose";
import Supplier from "../models/supplier.model.js";
import SupplierAdjustment from "../models/supplierAdjustment.model.js";

export const getSupplierPassbook = async (req, res) => {
  try {
    const { supplierId } = req.params;
    const { month, year, search, page, limit, sortBy, sortOrder } = req.query;

    const supplier = await Supplier.findOne({ _id: supplierId, isDeleted: false })
      .select("name phone supplyBalance passbookBalance");
    if (!supplier) return res.status(404).json({ message: "Supplier not found." });

    const { parsePagination, buildPaginationMeta, escapeRegex } = await import("../utils/pagination.js");
    const wantsPagination = page != null || limit != null || search || sortBy;
    const { page: p, limit: lim, skip, sort } = parsePagination(
      { page, limit, sortBy, sortOrder },
      { defaultLimit: 20, maxLimit: 100, defaultSort: { date: -1, createdAt: -1 }, allowedSortFields: ["date","amount","createdAt"] }
    );
    const filter = { supplierId: new mongoose.Types.ObjectId(supplierId) };

    if (month && year) {
      const targetMonth = parseInt(month) - 1;
      const targetYear = parseInt(year);
      const start = new Date(Date.UTC(targetYear, targetMonth, 1));
      const end = new Date(Date.UTC(targetYear, targetMonth + 1, 1));
      filter.date = { $gte: start, $lt: end };
    }
    if (search) {
      const esc = escapeRegex(search.trim());
      filter.$or = [
        { description: { $regex: esc, $options: "i" } },
        { notes: { $regex: esc, $options: "i" } },
        { category: { $regex: esc, $options: "i" } },
      ];
    }

    if (!wantsPagination) {
      const all = await SupplierAdjustment.find(filter).populate("recordedBy", "name").sort(sort).lean();
      const entries = all.map((a) => ({
        _id: a._id,
        date: a.date,
        type: a.type,
        amount: a.amount,
        description: a.description,
        notes: a.notes || "",
        category: a.category,
        recordedBy: a.recordedBy?.name,
        paymentId: a.paymentId || null,
        isAuto: a.category === "payment_difference" && !!a.paymentId,
        isSettled: !!a.paymentId && a.category !== "payment_difference",
        createdAt: a.createdAt,
      }));
      return res.status(200).json({
        supplier: {
          _id: supplier._id,
          name: supplier.name,
          phone: supplier.phone,
          supplyBalance: supplier.supplyBalance,
          passbookBalance: supplier.passbookBalance,
          outstandingAmount: supplier.supplyBalance + supplier.passbookBalance,
        },
        entries,
        total: entries.length,
        page: 1,
        limit: entries.length || 1,
        totalPages: 1,
      });
    }

    const [adjustments, total] = await Promise.all([
      SupplierAdjustment.find(filter).populate("recordedBy", "name").sort(sort).skip(skip).limit(lim).lean(),
      SupplierAdjustment.countDocuments(filter),
    ]);
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
      isAuto: a.category === "payment_difference" && !!a.paymentId,
      isSettled: !!a.paymentId && a.category !== "payment_difference",
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
      ...buildPaginationMeta(total, p, lim),
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

    const balanceDelta = type === "credit" ? Number(amount) : -Number(amount);
    let adjustment;

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        [adjustment] = await SupplierAdjustment.create([{
          supplierId,
          type,
          category,
          amount: Number(amount),
          date: new Date(date),
          description,
          notes: notes || "",
          recordedBy: req.user._id,
        }], { session });

        await Supplier.updateOne(
          { _id: supplierId },
          { $inc: { passbookBalance: balanceDelta } },
          { session }
        );
      });
    } finally {
      await session.endSession();
    }

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
      const reason = adjustment.category === "payment_difference"
        ? "Cannot delete auto-created payment difference entries."
        : "Cannot delete adjustments that have been settled in a recorded payment.";
      return res.status(400).json({ message: reason });
    }

    const reverseDelta = adjustment.type === "credit" ? -adjustment.amount : adjustment.amount;

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await Supplier.updateOne(
          { _id: supplierId },
          { $inc: { passbookBalance: reverseDelta } },
          { session }
        );
        await SupplierAdjustment.findByIdAndDelete(id, { session });
      });
    } finally {
      await session.endSession();
    }

    res.status(200).json({ message: "Adjustment deleted." });
  } catch (error) {
    console.error("Delete Adjustment Error:", error);
    res.status(500).json({ message: "Failed to delete adjustment." });
  }
};
