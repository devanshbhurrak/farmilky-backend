import mongoose from "mongoose";

export const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
    });
    console.log("Database Connected Successfully!");
  } catch (error) {
    console.error("Database Connection Failed!", error.message);
    throw error;
  }
};
