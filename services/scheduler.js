import cron from "node-cron";
import Subscription from "../models/subscription.model.js";
import Invoice from "../models/invoice.model.js";

export const runDailyDeliveryJob = async () => {
  console.log("Running daily delivery job...");

  let processedCount = 0;
  const activeSubs = await Subscription.find({ status: "active" });

  const today = new Date();
  const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const todayName = daysOfWeek[today.getDay()];

  for (const sub of activeSubs) {
    let isDue = false;

    if (sub.deliverySchedule === "daily") {
      isDue = true;
    } else if (sub.deliverySchedule === "alternate") {
      const diffTime = Math.abs(today - new Date(sub.startDate));
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays % 2 === 0) isDue = true;
    } else if (sub.deliverySchedule === "custom" && sub.customDays.includes(todayName)) {
      isDue = true;
    }

    if (!isDue) {
      continue;
    }

    const deliveryEntry = {
      date: new Date(),
      quantityDelivered: sub.quantityPerDay,
      pricePerUnit: sub.totalPricePerDay / sub.quantityPerDay,
      totalAmount: sub.totalPricePerDay,
    };

    sub.deliveryHistory.push(deliveryEntry);
    sub.pendingAmount += sub.totalPricePerDay;

    const nextDate = new Date(sub.nextDeliveryDate);
    nextDate.setDate(nextDate.getDate() + 1);
    sub.nextDeliveryDate = nextDate;

    await sub.save();
    processedCount += 1;
  }

  console.log(`Daily delivery job completed. Processed ${processedCount} subscriptions.`);
  return { processedCount };
};

export const runMonthlyInvoiceGenerationJob = async () => {
  console.log("Running monthly invoice generation job...");

  let invoiceCount = 0;
  const subscriptions = await Subscription.find({ pendingAmount: { $gt: 0 } });

  for (const sub of subscriptions) {
    const invoice = new Invoice({
      subscriptionId: sub._id,
      userId: sub.userId,
      items: sub.deliveryHistory.filter(() => true),
      totalAmount: sub.pendingAmount,
      month: new Date().toLocaleString("default", { month: "short", year: "numeric" }),
      dueDate: new Date(new Date().setDate(new Date().getDate() + 7)),
      status: "unpaid",
    });

    await invoice.save();

    sub.pendingAmount = 0;
    await sub.save();
    invoiceCount += 1;
  }

  console.log(`Monthly invoice job completed. Generated ${invoiceCount} invoices.`);
  return { invoiceCount };
};

const initScheduler = () => {
  console.log("Local scheduler enabled.");

  cron.schedule("0 0 * * *", async () => {
    try {
      await runDailyDeliveryJob();
    } catch (error) {
      console.error("Daily delivery job failed:", error);
    }
  });

  cron.schedule("0 0 1 * *", async () => {
    try {
      await runMonthlyInvoiceGenerationJob();
    } catch (error) {
      console.error("Monthly invoice job failed:", error);
    }
  });
};

export default initScheduler;
