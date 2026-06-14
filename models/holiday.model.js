import mongoose from "mongoose";

const holidaySchema = new mongoose.Schema(
  {
    date: {
      type: Date,
      required: [true, "Holiday date is required"],
      unique: true,
    },
    name: {
      type: String,
      required: [true, "Holiday name is required"],
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

const Holiday = mongoose.model("Holiday", holidaySchema);
export default Holiday;
