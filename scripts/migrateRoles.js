import mongoose from "mongoose";
import User from "../models/user.model.js";

async function migrateRoles() {
  const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/farmilky";
  await mongoose.connect(uri);

  const result = await User.updateMany(
    { role: { $in: ["delivery", "delivery_partner"] } },
    { $set: { role: "agent", "agentInfo.joiningDate": new Date() } }
  );

  console.log(`Migrated ${result.modifiedCount} users to "agent" role`);
  await mongoose.disconnect();
  process.exit(0);
}

migrateRoles().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
