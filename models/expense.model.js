import mongoose from "mongoose";

const expenseSchema = new mongoose.Schema(
  {
    amount: {
      type: Number,
      required: [true, "Amount is required"],
      min: [0, "Amount must be non-negative"],
    },
    category: {
      type: String,
      enum: [
        "fuel_transport",
        "packaging",
        "equipment",
        "salaries",
        "rent",
        "utilities",
        "maintenance",
        "marketing",
        "miscellaneous",
      ],
      required: [true, "Category is required"],
    },
    date: {
      type: Date,
      required: [true, "Date is required"],
    },
    description: {
      type: String,
      required: [true, "Description is required"],
      trim: true,
    },
    paymentMethod: {
      type: String,
      enum: ["cash", "upi", "bank_transfer", "card", "other"],
      default: "cash",
    },
    receiptReference: {
      type: String,
      default: "",
    },
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

expenseSchema.index({ date: -1 });
expenseSchema.index({ category: 1, date: -1 });

const Expense = mongoose.model("Expense", expenseSchema);
export default Expense;
