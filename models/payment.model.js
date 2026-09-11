import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  amount: {
    type: Number,
    required: true,
  },
  transactionId: {
    type: String,
  },
  type: {
    type: String,
    enum: ["payment", "credit_adjustment", "debit_adjustment"],
    default: "payment",
  },
  notes: {
    type: String,
  },
  recordedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  date: {
    type: Date,
    default: Date.now,
  },
  receivedDate: {
    type: Date,
  },
}, { timestamps: true });

paymentSchema.index({ userId: 1, date: -1 });

export default mongoose.model("Payment", paymentSchema);
