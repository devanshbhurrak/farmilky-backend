import mongoose from "mongoose";

const areaSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Area name is required"],
      unique: true,
      trim: true,
    },
    pincodes: [{ type: String, trim: true }],
    localities: [{ type: String, trim: true }],
    assignedAgent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

const Area = mongoose.model("Area", areaSchema);
export default Area;
