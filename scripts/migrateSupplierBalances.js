import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../../.env") });

import Supplier from "../models/supplier.model.js";
import MilkCollection from "../models/milkCollection.model.js";
import SupplierAdjustment from "../models/supplierAdjustment.model.js";

async function migrate() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB");

  const suppliers = await Supplier.find({ isDeleted: false });
  console.log(`Migrating ${suppliers.length} suppliers...`);

  for (const supplier of suppliers) {
    // supplyBalance = sum of unpaid confirmed collections
    const [unpaidResult] = await MilkCollection.aggregate([
      { $match: { supplierId: supplier._id, status: "confirmed", paymentId: null } },
      { $group: { _id: null, total: { $sum: "$totalAmount" } } },
    ]);

    // passbookBalance = sum of adjustments (credits - debits)
    const adjustments = await SupplierAdjustment.find({ supplierId: supplier._id });
    const passbookBalance = parseFloat(adjustments.reduce((sum, a) => {
      return sum + (a.type === "credit" ? a.amount : -a.amount);
    }, 0).toFixed(2));

    const supplyBalance = parseFloat((unpaidResult?.total || 0).toFixed(2));
    const oldBalance = supplier.accountBalance || 0;
    const newTotal = supplyBalance + passbookBalance;

    await Supplier.updateOne(
      { _id: supplier._id },
      { $set: { supplyBalance, passbookBalance }, $unset: { accountBalance: 1 } }
    );

    const drift = Math.abs(newTotal - oldBalance) > 0.01 ? ` ⚠️ DRIFT (old=${oldBalance})` : "";
    console.log(`  ${supplier.name}: supply=₹${supplyBalance}, passbook=₹${passbookBalance}, total=₹${newTotal}${drift}`);
  }

  console.log("Migration complete.");
  await mongoose.disconnect();
}

migrate().catch((err) => { console.error(err); process.exit(1); });
