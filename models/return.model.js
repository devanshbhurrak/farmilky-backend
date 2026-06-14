import mongoose from "mongoose";

const returnSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    reason: {
      type: String,
      required: [true, "Reason is required"],
      trim: true,
      maxlength: 500,
    },
    status: {
      type: String,
      enum: ["requested", "approved", "rejected", "completed"],
      default: "requested",
    },
    refundAmount: {
      type: Number,
      default: null,
    },
    adminNotes: {
      type: String,
      default: null,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

const Return = mongoose.model("Return", returnSchema);
export default Return;
