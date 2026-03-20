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
      },
    ],
    role: {
      type: String,
      enum: ["customer", "admin", "delivery"],
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
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);

export default User
