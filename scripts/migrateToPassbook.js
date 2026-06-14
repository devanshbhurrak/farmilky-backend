import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "../models/user.model.js";
import Order from "../models/order.model.js";
import Subscription from "../models/subscription.model.js";
import Invoice from "../models/invoice.model.js";
import Payment from "../models/payment.model.js";
import { connectDB } from "../config/db.js";

dotenv.config();

const migrate = async () => {
  try {
    await connectDB();
    console.log("Connected to database. Starting migration...");

    const users = await User.find();
    console.log(`Found ${users.length} users to process.`);

    for (const user of users) {
      console.log(`Processing user: ${user.name} (${user._id})`);

      // 1. Calculate Total Debits (Deliveries & Orders)
      const orders = await Order.find({ userId: user._id, orderStatus: "delivered" });
      const orderTotal = orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);

      const subscriptions = await Subscription.find({ userId: user._id });
      let subTotal = 0;
      subscriptions.forEach(sub => {
        sub.deliveryHistory.forEach(entry => {
          if (["delivered", "extra", "partial"].includes(entry.status)) {
            subTotal += (entry.totalAmount || 0);
          }
        });
      });

      // 2. Process Legacy Invoices & Create Payments
      const invoices = await Invoice.find({ userId: user._id });
      let creditTotal = 0;

      for (const inv of invoices) {
        if (inv.amountPaid > 0) {
          creditTotal += inv.amountPaid;

          // If this invoice has specific payments recorded (from our previous change)
          if (inv.payments && inv.payments.length > 0) {
            for (const p of inv.payments) {
              await Payment.create({
                userId: user._id,
                amount: p.amount,
                transactionId: p.transactionId,
                notes: `Migrated from Invoice ${inv.month}`,
                recordedBy: p.recordedBy,
                date: p.date
              });
            }
          } else {
            // Legacy flat amountPaid
            await Payment.create({
              userId: user._id,
              amount: inv.amountPaid,
              notes: `Migrated balance from Invoice ${inv.month}`,
              date: inv.updatedAt || new Date()
            });
          }
        }
      }

      // 3. Update User Balance
      const finalBalance = (orderTotal + subTotal) - creditTotal;
      await User.findByIdAndUpdate(user._id, { accountBalance: finalBalance });
      console.log(`   Balance Set: ${finalBalance} (Debits: ${orderTotal + subTotal}, Credits: ${creditTotal})`);
    }

    console.log("Migration completed successfully.");
    process.exit(0);
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
};

migrate();
