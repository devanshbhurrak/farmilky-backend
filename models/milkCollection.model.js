import mongoose from "mongoose";

const milkCollectionSchema = new mongoose.Schema(
  {
    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
      required: [true, "Supplier is required"],
    },
    date: {
      type: Date,
      required: [true, "Collection date is required"],
    },
    session: {
      type: String,
      enum: ["morning", "evening"],
      required: [true, "Session is required"],
    },
    // Pre-filled from supplier defaults at generation time
    expectedQty: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Set only on confirmation
    actualQty: {
      type: Number,
      default: null,
      min: 0,
    },
    // Quality metrics (optional, filled at confirmation)
    fatContent: {
      type: Number,
      default: null,
      min: 0,
    },
    snf: {
      type: Number,
      default: null,
      min: 0,
    },
    // Pre-filled with supplier's defaultRatePerLiter at generation; admin overrides at confirmation
    ratePerLiter: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Stored snapshot: actualQty × ratePerLiter (avoids recompute on queries)
    totalAmount: {
      type: Number,
      default: null,
    },
    status: {
      type: String,
      enum: ["pending", "confirmed"],
      default: "pending",
    },
    // Null until included in a SupplierPayment
    paymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SupplierPayment",
      default: null,
    },
    confirmedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    confirmedAt: {
      type: Date,
      default: null,
    },
    notes: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

// Prevent duplicate entries for the same supplier/date/session
milkCollectionSchema.index(
  { supplierId: 1, date: 1, session: 1 },
  { unique: true }
);

// Fast daily confirmation queries
milkCollectionSchema.index({ date: 1, status: 1 });

// Fast outstanding-amount aggregations (status + paymentId filter per supplier)
milkCollectionSchema.index({ supplierId: 1, status: 1, paymentId: 1 });

// Supplier detail history queries
milkCollectionSchema.index({ supplierId: 1, date: -1 });

const MilkCollection = mongoose.model("MilkCollection", milkCollectionSchema);
export default MilkCollection;
