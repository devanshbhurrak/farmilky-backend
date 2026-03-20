import mongoose from "mongoose";

const deliverySchema = new mongoose.Schema({
  date: { type: Date, required: true },
  quantityDelivered: { type: Number, required: true },
  pricePerUnit: { type: Number, required: true },
  totalAmount: { type: Number, required: true },
});

const subscriptionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    quantityPerDay: {
      type: Number,
      required: true,
      min: 1,
    },
    deliverySchedule: {
      type: String,
      enum: ["daily", "alternate", "custom"],
      default: "daily",
    },
    customDays: {
      type: [String],
      enum: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      default: [],
    },
    startDate: {
      type: Date,
      default: Date.now,
    },
    nextDeliveryDate: {
      type: Date,
      required: true,
    },
    totalPricePerDay: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "paused", "cancelled"],
      default: "active",
    },
    pauseReason: {
      type: String,
      default: null,
    },
    deliveryHistory: [deliverySchema],
    pendingAmount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Subscription", subscriptionSchema);
