import mongoose from "mongoose";

export const connectDB = async () => {
  console.log("[db] connectDB called");
  console.log("[db] MONGO_URI present:", !!process.env.MONGO_URI);
  console.log("[db] readyState before connect:", mongoose.connection.readyState);
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
    });
    console.log("[db] readyState after connect:", mongoose.connection.readyState);
    console.log("Database Connected Successfully!");
  } catch (error) {
    console.error("[db] Connection failed — name:", error.name);
    console.error("[db] Connection failed — message:", error.message);
    if (error.reason) console.error("[db] Connection failed — reason:", error.reason);
    throw error;
  }
};
