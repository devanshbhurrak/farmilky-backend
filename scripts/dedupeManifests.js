// One-time cleanup: removes duplicate manifests (same area + same date),
// keeping the earliest-created document. Run this BEFORE the unique
// { date, areaId } index is built, otherwise index creation will fail:
//
//   node scripts/dedupeManifests.js

import mongoose from "mongoose";
import dotenv from "dotenv";
import DeliveryManifest from "../models/deliveryManifest.model.js";

dotenv.config();

const main = async () => {
  await mongoose.connect(process.env.MONGO_URI);

  const groups = await DeliveryManifest.aggregate([
    {
      $group: {
        _id: {
          areaId: "$areaId",
          // Group by calendar day; all stored dates are local-midnight, so
          // grouping on the UTC projection keeps same-day docs together.
          date: { $dateToString: { format: "%Y-%m-%d", date: "$date", timezone: "UTC" } },
        },
        count: { $sum: 1 },
        docs: { $push: { _id: "$_id", createdAt: "$createdAt" } },
      },
    },
    { $match: { count: { $gt: 1 } } },
  ]);

  if (groups.length === 0) {
    console.log("No duplicate manifests found. Safe to enable the unique index.");
    await mongoose.disconnect();
    return;
  }

  let removed = 0;
  for (const group of groups) {
    group.docs.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
    const keep = group.docs[0];
    const removeIds = group.docs.slice(1).map((d) => d._id);
    const result = await DeliveryManifest.deleteMany({ _id: { $in: removeIds } });
    removed += result.deletedCount;
    console.log(`[${group._id.date}] area=${group._id.areaId}: kept ${keep._id}, removed ${result.deletedCount}`);
  }

  console.log(`Removed ${removed} duplicate manifest(s).`);
  await mongoose.disconnect();
};

main().catch((error) => {
  console.error("Dedupe failed:", error);
  process.exit(1);
});
