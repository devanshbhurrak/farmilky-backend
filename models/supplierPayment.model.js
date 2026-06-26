import mongoose from "mongoose";

const supplierPaymentSchema = new mongoose.Schema(
  {
    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
      required: [true, "Supplier is required"],
    },
    amount: {
      type: Number,
      required: [true, "Payment amount is required"],
      min: 0,
    },
    fromDate: {
      type: Date,
      required: [true, "From date is required"],
    },
    toDate: {
      type: Date,
      required: [true, "To date is required"],
    },
    // Snapshot count of collections covered — avoids reverse lookups for display
    collectionCount: {
      type: Number,
      default: 0,
    },
    paymentMethod: {
      type: String,
      enum: ["cash", "bank_transfer", "upi"],
      default: "cash",
    },
    transactionRef: {
      type: String,
      trim: true,
      default: "",
    },
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    paidAt: {
      type: Date,
      default: Date.now,
    },
    notes: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

// Fast payment history queries per supplier
supplierPaymentSchema.index({ supplierId: 1, paidAt: -1 });

const SupplierPayment = mongoose.model("SupplierPayment", supplierPaymentSchema);
export default SupplierPayment;
