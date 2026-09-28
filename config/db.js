import mongoose from "mongoose";

// uri is optional: caller can pass env.MONGO_URI explicitly (Workers fetch
// lifecycle) or omit to fall back to process.env.MONGO_URI (local / Vercel).
export const connectDB = async (uri) => {
  const mongoUri = uri ?? process.env.MONGO_URI;
  console.log("[db] connectDB called");
  console.log("[db] MONGO_URI present:", !!mongoUri);
  console.log("[db] readyState before connect:", mongoose.connection.readyState);
  try {
    await mongoose.connect(mongoUri, {
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
