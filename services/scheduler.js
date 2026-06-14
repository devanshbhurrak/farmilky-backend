import cron from "node-cron";
import Subscription from "../models/subscription.model.js";
import DeliveryManifest from "../models/deliveryManifest.model.js";

const normalizeDate = (value) => {
  const normalized = new Date(value);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
};

const getDeliveryEntryDate = (entry) => entry.deliveryDate || entry.date;

const getNextCustomDate = (baseDate, customDays = []) => {
  const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  for (let offset = 1; offset <= 7; offset += 1) {
    const candidate = normalizeDate(baseDate);
    candidate.setDate(candidate.getDate() + offset);
    if (customDays.includes(daysOfWeek[candidate.getDay()])) {
      return candidate;
    }
  }

  const fallback = normalizeDate(baseDate);
  fallback.setDate(fallback.getDate() + 1);
  return fallback;
};

export const calculateNextDeliveryDate = (subscription, referenceDate = new Date()) => {
  const current = normalizeDate(referenceDate);

  if (subscription.deliverySchedule === "daily") {
    current.setDate(current.getDate() + 1);
    return current;
  }

  if (subscription.deliverySchedule === "alternate") {
    current.setDate(current.getDate() + 2);
    return current;
  }

  if (subscription.deliverySchedule === "weekly") {
    current.setDate(current.getDate() + 7);
    return current;
  }

  if (subscription.deliverySchedule === "custom") {
    return getNextCustomDate(current, subscription.customDays);
  }

  current.setDate(current.getDate() + 1);
  return current;
};

export const isSubscriptionDueOnDate = (subscription, date = new Date()) => {
  const normalizedDate = normalizeDate(date);

  if (subscription.status !== "active") {
    return false;
  }

  // Vacation window check
  if (subscription.vacationSchedule?.pauseFrom && subscription.vacationSchedule?.pauseUntil) {
    const from = normalizeDate(subscription.vacationSchedule.pauseFrom);
    const until = normalizeDate(subscription.vacationSchedule.pauseUntil);
    if (normalizedDate >= from && normalizedDate <= until) {
      return false;
    }
  }

  // Skipped dates check
  if (subscription.skippedDates?.length > 0) {
    const isSkipped = subscription.skippedDates.some(
      (d) => normalizeDate(d).getTime() === normalizedDate.getTime()
    );
    if (isSkipped) return false;
  }

  const nextDeliveryDate = normalizeDate(subscription.nextDeliveryDate || subscription.startDate || normalizedDate);
  return normalizedDate.getTime() >= nextDeliveryDate.getTime();
};

export const runDailyDeliveryJob = async () => {
  console.log("Running daily delivery job...");

  let pendingCount = 0;
  const activeSubs = await Subscription.find({ status: "active" });

  const today = normalizeDate(new Date());

  for (const sub of activeSubs) {
    if (!isSubscriptionDueOnDate(sub, today)) {
      continue;
    }

    const alreadyActionedToday = sub.deliveryHistory.some((entry) => {
      const entryDateValue = getDeliveryEntryDate(entry);
      if (!entryDateValue) return false;
      const entryDate = normalizeDate(entryDateValue);
      return entryDate.getTime() === today.getTime();
    });

    if (alreadyActionedToday) {
      console.log(`[Scheduler] Subscription ${sub._id} already actioned for today.`);
      continue;
    }
    pendingCount += 1;
  }

  // Apply scheduled quantity changes that are due today
  const pendingChanges = await Subscription.find({
    "scheduledChange.effectiveDate": { $lte: today },
    "scheduledChange.newQuantityPerDay": { $ne: null },
  }).populate("productId");

  for (const sub of pendingChanges) {
    if (sub.productId) {
      console.log(`[Scheduler] Applying quantity change for sub ${sub._id}: ${sub.quantityPerDay} -> ${sub.scheduledChange.newQuantityPerDay}`);
      sub.quantityPerDay = sub.scheduledChange.newQuantityPerDay;
      sub.totalPricePerDay = sub.productId.price * sub.quantityPerDay;
    }
    sub.scheduledChange = { newQuantityPerDay: null, effectiveDate: null };
    await sub.save();
  }
  if (pendingChanges.length > 0) {
    console.log(`Applied ${pendingChanges.length} scheduled quantity changes.`);
  }

  // Auto-clear expired vacation schedules and advance nextDeliveryDate
  const expiredVacations = await Subscription.find({
    status: "active",
    "vacationSchedule.pauseUntil": { $lte: today },
    "vacationSchedule.pauseFrom": { $ne: null },
  });
  for (const sub of expiredVacations) {
    sub.nextDeliveryDate = calculateNextDeliveryDate(sub, sub.vacationSchedule.pauseUntil);
    sub.vacationSchedule = { pauseFrom: null, pauseUntil: null };
    await sub.save();
  }
  if (expiredVacations.length > 0) {
    console.log(`Auto-cleared ${expiredVacations.length} expired vacation schedules.`);
  }

  // Clean up skipped dates older than 7 days
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const subsWithOldSkips = await Subscription.find({
    skippedDates: { $elemMatch: { $lt: sevenDaysAgo } },
  });
  for (const sub of subsWithOldSkips) {
    sub.skippedDates = sub.skippedDates.filter((d) => d >= sevenDaysAgo);
    await sub.save();
  }

  console.log(`Daily delivery job completed. ${pendingCount} subscriptions are due today.`);
  return { pendingCount };
};

export const runEndOfDayJob = async () => {
  console.log("Running end-of-day job...");
  const today = normalizeDate(new Date());

  // Auto-mark pending manifest entries as failed (not attempted)
  const activeManifests = await DeliveryManifest.find({
    date: today,
    status: { $ne: "completed" },
  });

  let autoMarkedCount = 0;
  for (const manifest of activeManifests) {
    let changed = false;
    console.log(`[Scheduler] Processing manifest ${manifest._id} for end-of-day.`);
    for (const entry of manifest.entries) {
      if (entry.status === "pending") {
        entry.status = "failed";
        entry.failureReason = "not attempted";
        changed = true;
        autoMarkedCount++;
      }
    }
    if (changed) {
      const counts = manifest.entries.reduce(
        (acc, e) => { acc[e.status] = (acc[e.status] || 0) + 1; return acc; },
        { pending: 0, delivered: 0, failed: 0, skipped: 0 }
      );
      manifest.summary = {
        total: manifest.entries.length,
        delivered: counts.delivered,
        failed: counts.failed,
        pending: 0,
      };
      manifest.status = "completed";
      await manifest.save();
      console.log(`[Scheduler] Manifest ${manifest._id} auto-completed.`);
    }
  }

  if (autoMarkedCount > 0) {
    console.log(`End-of-day: auto-marked ${autoMarkedCount} pending entries as failed.`);
  }

  console.log("End-of-day job completed.");
  return { autoMarkedCount };
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

  // End-of-day at 21:00 — mark unattempted deliveries as failed
  cron.schedule("0 21 * * *", async () => {
    try {
      await runEndOfDayJob();
    } catch (error) {
      console.error("End-of-day job failed:", error);
    }
  });
};

export default initScheduler;
