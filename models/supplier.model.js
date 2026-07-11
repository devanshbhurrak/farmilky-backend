import mongoose from "mongoose";

const bankDetailsSchema = new mongoose.Schema(
  {
    accountNo: { type: String, trim: true, default: "" },
    ifscCode: { type: String, trim: true, default: "" },
    bankName: { type: String, trim: true, default: "" },
    holderName: { type: String, trim: true, default: "" },
  },
  { _id: false }
);

const supplierSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Supplier name is required"],
      trim: true,
    },
    phone: {
      type: String,
      required: [true, "Phone number is required"],
      unique: true,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
    },
    location: {
      type: String,
      trim: true,
      default: "",
    },
    pincode: {
      type: String,
      trim: true,
      default: "",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    joiningDate: {
      type: Date,
      default: null,
    },
    // Which sessions this supplier participates in
    collectionSessions: {
      type: [{ type: String, enum: ["morning", "evening"] }],
      default: ["morning", "evening"],
    },
    defaultMorningQty: {
      type: Number,
      default: 0,
      min: 0,
    },
    defaultEveningQty: {
      type: Number,
      default: 0,
      min: 0,
    },
    defaultRatePerLiter: {
      type: Number,
      default: 0,
      min: 0,
    },
    bankDetails: {
      type: bankDetailsSchema,
      default: () => ({}),
    },
    notes: {
      type: String,
      default: "",
    },
    // Future-proofing: link to a User account when supplier portal is added
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    supplyBalance: {
      type: Number,
      default: 0,
    },
    passbookBalance: {
      type: Number,
      default: 0,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

// Indexes
supplierSchema.index({ isDeleted: 1, isActive: 1 });
supplierSchema.index({ phone: 1 }, { unique: true });

const Supplier = mongoose.model("Supplier", supplierSchema);
export default Supplier;
