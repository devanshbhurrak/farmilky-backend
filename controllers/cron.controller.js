import {
  runDailyDeliveryJob,
  runEndOfDayJob,
} from "../services/scheduler.js";

export const isAuthorizedCronRequest = (req) => {
  const authHeader = req.headers.authorization || "";
  const expectedSecret = process.env.CRON_SECRET;

  if (!expectedSecret) {
    return false;
  }

  return authHeader === `Bearer ${expectedSecret}`;
};

export const runDailyDeliveryCron = async (req, res) => {
  try {
    if (!isAuthorizedCronRequest(req)) {
      return res.status(401).json({ message: "Unauthorized cron request" });
    }

    const result = await runDailyDeliveryJob();
    return res.status(200).json({
      message: "Daily delivery job completed",
      ...result,
    });
  } catch (error) {
    console.error("Daily delivery cron failed:", error);
    return res.status(500).json({ message: "Daily delivery job failed" });
  }
};

export const runEndOfDayCron = async (req, res) => {
  try {
    if (!isAuthorizedCronRequest(req)) {
      return res.status(401).json({ message: "Unauthorized cron request" });
    }

    const result = await runEndOfDayJob();
    return res.status(200).json({
      message: "End-of-day job completed",
      ...result,
    });
  } catch (error) {
    console.error("End-of-day cron failed:", error);
    return res.status(500).json({ message: "End-of-day job failed" });
  }
};
