import cron from "node-cron";
import Subscription from "../models/subscription.model.js";
import Invoice from "../models/invoice.model.js";

export const isSubscriptionDueOnDate = (subscription, date = new Date()) => {
  const normalizedDate = new Date(date);
  normalizedDate.setHours(0, 0, 0, 0);
  const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dateName = daysOfWeek[normalizedDate.getDay()];

  if (subscription.status !== "active") {
    return false;
  }

  if (subscription.deliverySchedule === "daily") {
    return true;
  }

  if (subscription.deliverySchedule === "alternate") {
    const startDate = new Date(subscription.startDate);
    startDate.setHours(0, 0, 0, 0);
    const diffTime = Math.abs(normalizedDate - startDate);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays % 2 === 0;
  }

  if (subscription.deliverySchedule === "custom") {
    return subscription.customDays.includes(dateName);
  }

  return false;
};

export const runDailyDeliveryJob = async () => {
  console.log("Running daily delivery job...");

  let processedCount = 0;
  const activeSubs = await Subscription.find({ status: "active" });

  const today = new Date();

  for (const sub of activeSubs) {
    if (!isSubscriptionDueOnDate(sub, today)) {
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
