import mongoose from "mongoose";

const deliverySchema = new mongoose.Schema({
  deliveryDate:      { type: Date },
  date:              { type: Date },
  status:            { type: String, enum: ["delivered","skipped","partial","extra","failed"], default: "delivered" },
  scheduledQuantity: { type: Number },
  actualQuantity:    { type: Number },
  quantityDelivered: { type: Number },
  pricePerUnit:      { type: Number, required: true },
  totalAmount:       { type: Number, required: true },
  reason:            { type: String, default: null },
  notes:             { type: String, default: null },
  handledBy:         { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  handledAt:         { type: Date, default: Date.now },
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
      enum: ["daily", "alternate", "weekly", "custom"],
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
    pricePerUnit: {
      type: Number,
      default: null,
    },
    variantId:    { type: mongoose.Schema.Types.ObjectId, default: null },
    variantLabel: { type: String, default: null },
    variantUnit:  { type: String, default: null },
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
    vacationSchedule: {
      pauseFrom: { type: Date, default: null },
      pauseUntil: { type: Date, default: null },
    },
    skippedDates: [{ type: Date }],
    scheduledChange: {
      newQuantityPerDay: { type: Number, default: null },
      effectiveDate: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

export default mongoose.model("Subscription", subscriptionSchema);
