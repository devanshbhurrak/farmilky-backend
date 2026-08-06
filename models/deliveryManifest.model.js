import mongoose from "mongoose";

const manifestEntrySchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ["subscription", "order"],
    required: true,
  },
  referenceId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
  },
  customerName: { type: String, default: "" },
  phone: { type: String, default: "" },
  address: { type: String, default: "" },
  productLabel: { type: String, default: "" },
  quantity: { type: Number, default: 0 },
  unit: { type: String, default: "unit" },
  amount: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ["pending", "delivered", "failed", "skipped"],
    default: "pending",
  },
  proofOfDelivery: { type: String, default: null },
  deliveryNotes: { type: String, default: null },
  deliveredAt: { type: Date, default: null },
  failureReason: { type: String, default: null },
  sequence: { type: Number, default: null },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  lat: { type: Number, default: null },
  lng: { type: Number, default: null },
});

const deliveryManifestSchema = new mongoose.Schema(
  {
    date: {
      type: Date,
      required: true,
    },
    agentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    areaId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Area",
      default: null,
    },
    entries: [manifestEntrySchema],
    summary: {
      total: { type: Number, default: 0 },
      delivered: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      pending: { type: Number, default: 0 },
    },
    status: {
      type: String,
      enum: ["draft", "active", "completed"],
      default: "draft",
    },
  },
  { timestamps: true }
);

// One sheet per area per date — guards against duplicate generation from
// concurrent runs (manual button + cron + startup) in a race-safe way.
deliveryManifestSchema.index({ date: 1, areaId: 1 }, { unique: true });

const DeliveryManifest = mongoose.model("DeliveryManifest", deliveryManifestSchema);
export default DeliveryManifest;
