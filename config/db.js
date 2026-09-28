import mongoose from "mongoose";

export const connectDB = async (mongoUri) => {
  try {
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
    });
    console.log("Database Connected Successfully!");
  } catch (error) {
    console.error("[db] Connection failed:", error.name, "-", error.message);
    if (error.reason) console.error("[db] Reason:", error.reason);
    throw error;
  }
};
