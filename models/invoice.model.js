import mongoose from "mongoose";

const invoiceSchema = new mongoose.Schema({
  subscriptionId: { type: mongoose.Schema.Types.ObjectId, ref: "Subscription" },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  items: [
    {
      date: Date,
      quantity: Number,
      pricePerUnit: Number,
      totalAmount: Number,
    },
  ],
  totalAmount: Number,
  month: String, // e.g., "Jan-2025"
  dueDate: {
    type: Date,
  },
  transactionId: {
    type: String,
  },
  status: {
    type: String,
    enum: ["unpaid", "partial", "paid"],
    default: "unpaid",
  },
  amountPaid: {
    type: Number,
    default: 0,
  },
});

export default mongoose.model("Invoice", invoiceSchema);
