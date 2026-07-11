import mongoose from "mongoose";

const supplierAdjustmentSchema = new mongoose.Schema(
  {
    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
      required: [true, "Supplier is required"],
    },
    type: {
      type: String,
      enum: ["credit", "debit"],
      required: [true, "Type is required"],
    },
    category: {
      type: String,
      enum: ["advance", "transport", "quality_bonus", "quality_penalty", "rounding", "payment_difference", "other"],
      required: [true, "Category is required"],
    },
    amount: {
      type: Number,
      required: [true, "Amount is required"],
      min: [0, "Amount must be non-negative"],
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
    notes: {
      type: String,
      default: "",
    },
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SupplierPayment",
      default: null,
    },
  },
  { timestamps: true }
);

supplierAdjustmentSchema.index({ supplierId: 1, date: -1 });

const SupplierAdjustment = mongoose.model("SupplierAdjustment", supplierAdjustmentSchema);
export default SupplierAdjustment;
