import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Please enter your name"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Please enter your email"],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, "Please enter a password"],
      minlength: 6,
      select: false,
    },
    phone: {
      type: String,
      required: [true, "Please enter your phone number"],
      validate: {
        validator: (v) => /^[0-9]{10}$/.test(v),
        message: "Phone number must be 10 digits",
      },
    },
    profilePicture: {
      type: String,
      default: "",
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    addresses: [
      {
        street: { type: String },
        city: { type: String },
        state: { type: String },
        pincode: { type: Number },
        type: { type: String, enum: ["home", "work", "other"], default: "home" },
        lat: { type: Number, default: null },
        lng: { type: Number, default: null },
      },
    ],
    deliverySequence: {
      type: Number,
      default: null,
    },
    accountBalance: {
      type: Number,
      default: 0,
    },
    role: {
      type: String,
      enum: ["customer", "admin", "delivery", "delivery_partner", "agent", "supplier"],
      default: "customer",
    },
    orders: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Order",
      },
    ],
    isActive: {
      type: Boolean,
      default: false,
    },
    deliveryPreferences: {
      preferredTimeSlot: {
        type: String,
        enum: ["morning", "evening", "anytime"],
        default: "morning",
      },
      defaultDeliveryNotes: {
        type: String,
        default: "",
        maxlength: 200,
      },
    },
    assignedArea: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Area",
      default: null,
    },
    agentInfo: {
      joiningDate: { type: Date, default: null },
      availability: {
        type: String,
        enum: ["available", "busy", "offline"],
        default: "offline",
      },
      vehicleType: { type: String, default: "" },
      maxCapacity: { type: Number, default: 0 },
      assignedArea: { type: mongoose.Schema.Types.ObjectId, ref: "Area", default: null },
      lastActiveAt: { type: Date, default: null },
      managedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

userSchema.index({ phone: 1 }, { unique: true, sparse: true });
userSchema.index({ role: 1, createdAt: -1 });
userSchema.index({ "agentInfo.assignedArea": 1 });
userSchema.index({ assignedArea: 1, role: 1 });

const User = mongoose.model("User", userSchema);

export default User
