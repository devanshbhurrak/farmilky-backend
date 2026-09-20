import Expense from "../models/expense.model.js";
import mongoose from "mongoose";

const VALID_CATEGORIES = [
  "fuel_transport", "packaging", "equipment", "salaries",
  "rent", "utilities", "maintenance", "marketing", "miscellaneous",
];

const VALID_PAYMENT_METHODS = ["cash", "upi", "bank_transfer", "card", "other"];

function isValidDate(val) {
  const d = new Date(val);
  return !isNaN(d.getTime());
}

export const getAllExpenses = async (req, res) => {
  try {
    const { startDate, endDate, category, search, page, limit, sortBy, sortOrder } = req.query;
    const { parsePagination, buildPaginationMeta } = await import("../utils/pagination.js");
    const { page: p, limit: lim, skip, sort } = parsePagination(
      { page, limit, sortBy, sortOrder },
      { defaultLimit: 20, maxLimit: 100, defaultSort: { date: -1, createdAt: -1 }, allowedSortFields: ["date","amount","category","createdAt"] }
    );
    const filter = {};

    if (startDate || endDate) {
      filter.date = {};
      if (startDate) {
        if (!isValidDate(startDate)) return res.status(400).json({ message: "Invalid startDate." });
        filter.date.$gte = new Date(startDate);
      }
      if (endDate) {
        if (!isValidDate(endDate)) return res.status(400).json({ message: "Invalid endDate." });
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.date.$lte = end;
      }
    }

    if (category) filter.category = category;
    if (search) filter.description = { $regex: search, $options: "i" };

    const [expenses, total, aggTotal] = await Promise.all([
      Expense.find(filter)
        .populate("recordedBy", "name")
        .sort(sort)
        .skip(skip)
        .limit(lim)
        .lean(),
      Expense.countDocuments(filter),
      Expense.aggregate([{ $match: filter }, { $group: { _id: null, total: { $sum: "$amount" } } }]),
    ]);

    const totalAmount = aggTotal[0]?.total || 0;

    res.status(200).json({ expenses, totalAmount, ...buildPaginationMeta(total, p, lim) });
  } catch (error) {
    console.error("Get All Expenses Error:", error);
    res.status(500).json({ message: "Failed to fetch expenses." });
  }
};

export const createExpense = async (req, res) => {
  try {
    const { amount, category, date, description, paymentMethod, receiptReference } = req.body;

    if (amount === undefined || amount === null || amount === "") {
      return res.status(400).json({ message: "Amount is required." });
    }
    const parsedAmount = Number(amount);
    if (isNaN(parsedAmount) || parsedAmount < 0) {
      return res.status(400).json({ message: "Amount must be a non-negative number." });
    }
    if (!category || !VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ message: "A valid category is required." });
    }
    if (!date || !isValidDate(date)) {
      return res.status(400).json({ message: "A valid date is required." });
    }
    if (!description || !String(description).trim()) {
      return res.status(400).json({ message: "Description is required." });
    }
    if (paymentMethod && !VALID_PAYMENT_METHODS.includes(paymentMethod)) {
      return res.status(400).json({ message: "Invalid payment method." });
    }

    const expense = await Expense.create({
      amount: parsedAmount,
      category,
      date: new Date(date),
      description: String(description).trim(),
      paymentMethod: paymentMethod || "cash",
      receiptReference: receiptReference ? String(receiptReference).trim() : "",
      recordedBy: req.user._id,
    });

    res.status(201).json({ message: "Expense recorded.", expense });
  } catch (error) {
    if (error.name === "ValidationError") {
      const msg = Object.values(error.errors).map((e) => e.message).join(", ");
      return res.status(400).json({ message: msg });
    }
    console.error("Create Expense Error:", error);
    res.status(500).json({ message: "Failed to record expense." });
  }
};

export const updateExpense = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid expense ID." });
    }

    const expense = await Expense.findById(id);
    if (!expense) return res.status(404).json({ message: "Expense not found." });

    const { amount, category, date, description, paymentMethod, receiptReference } = req.body;

    if (amount !== undefined && amount !== null && amount !== "") {
      const parsedAmount = Number(amount);
      if (isNaN(parsedAmount) || parsedAmount < 0) {
        return res.status(400).json({ message: "Amount must be a non-negative number." });
      }
      expense.amount = parsedAmount;
    }
    if (category !== undefined) {
      if (!VALID_CATEGORIES.includes(category)) {
        return res.status(400).json({ message: "Invalid category." });
      }
      expense.category = category;
    }
    if (date !== undefined) {
      if (!isValidDate(date)) {
        return res.status(400).json({ message: "Invalid date." });
      }
      expense.date = new Date(date);
    }
    if (description !== undefined) {
      const trimmed = String(description).trim();
      if (!trimmed) return res.status(400).json({ message: "Description cannot be empty." });
      expense.description = trimmed;
    }
    if (paymentMethod !== undefined) {
      if (!VALID_PAYMENT_METHODS.includes(paymentMethod)) {
        return res.status(400).json({ message: "Invalid payment method." });
      }
      expense.paymentMethod = paymentMethod;
    }
    if (receiptReference !== undefined) {
      expense.receiptReference = String(receiptReference).trim();
    }

    await expense.save();
    res.status(200).json({ message: "Expense updated.", expense });
  } catch (error) {
    if (error.name === "ValidationError") {
      const msg = Object.values(error.errors).map((e) => e.message).join(", ");
      return res.status(400).json({ message: msg });
    }
    console.error("Update Expense Error:", error);
    res.status(500).json({ message: "Failed to update expense." });
  }
};

export const deleteExpense = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid expense ID." });
    }

    const expense = await Expense.findByIdAndDelete(id);
    if (!expense) return res.status(404).json({ message: "Expense not found." });

    res.status(200).json({ message: "Expense deleted." });
  } catch (error) {
    console.error("Delete Expense Error:", error);
    res.status(500).json({ message: "Failed to delete expense." });
  }
};

export const getExpenseSummary = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const match = {};

    if (startDate || endDate) {
      match.date = {};
      if (startDate) {
        if (!isValidDate(startDate)) return res.status(400).json({ message: "Invalid startDate." });
        match.date.$gte = new Date(startDate);
      }
      if (endDate) {
        if (!isValidDate(endDate)) return res.status(400).json({ message: "Invalid endDate." });
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        match.date.$lte = end;
      }
    }

    const [byCategory, byMonth] = await Promise.all([
      Expense.aggregate([
        { $match: match },
        { $group: { _id: "$category", total: { $sum: "$amount" }, count: { $sum: 1 } } },
        { $sort: { total: -1 } },
      ]),
      Expense.aggregate([
        { $match: match },
        {
          $group: {
            _id: { year: { $year: "$date" }, month: { $month: "$date" } },
            total: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
        { $sort: { "_id.year": -1, "_id.month": -1 } },
      ]),
    ]);

    const grandTotal = byCategory.reduce((sum, c) => sum + c.total, 0);

    res.status(200).json({ byCategory, byMonth, grandTotal });
  } catch (error) {
    console.error("Get Expense Summary Error:", error);
    res.status(500).json({ message: "Failed to fetch expense summary." });
  }
};
