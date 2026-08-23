import mongoose from "mongoose";
import { ALL_PERMISSIONS } from "../constants/permissions.js";

const rolePermissionSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ["delivery", "delivery_partner", "agent"],
      required: true,
      unique: true,
    },
    permissions: {
      type: [String],
      default: [],
      validate: {
        validator: (arr) => arr.every((p) => ALL_PERMISSIONS.includes(p)),
        message: "One or more permission keys are invalid.",
      },
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

export default mongoose.model("RolePermission", rolePermissionSchema);
