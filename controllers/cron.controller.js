import {
  runDailyDeliveryJob,
  runEndOfDayJob,
} from "../services/scheduler.js";
import { runDailyManifestGenerationJob } from "../services/manifestService.js";

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
    const manifestResult = await runDailyManifestGenerationJob();
    return res.status(200).json({
      message: "Daily delivery job completed",
      ...result,
      manifests: manifestResult,
    });
  } catch (error) {
    console.error("Daily delivery cron failed:", error);
    return res.status(500).json({ message: "Daily delivery job failed" });
  }
};

export const runMonthlyInvoiceCron = async (req, res) => {
  try {
    if (!isAuthorizedCronRequest(req)) {
      return res.status(401).json({ message: "Unauthorized cron request" });
    }
    // Generate invoices for the previous month
    const now = new Date();
    let month = now.getMonth(); // 0-indexed, so this is previous month (1-indexed)
    let year = now.getFullYear();
    if (month === 0) { month = 12; year -= 1; }

    const { generateBulkInvoices, markOverdueInvoices } = await import("../services/invoiceService.js");
    // Mark prior-month unpaid invoices as overdue before generating new ones
    const overdueResult = await markOverdueInvoices();
    const results = await generateBulkInvoices(month, year, { generatedBy: "system" });
    return res.status(200).json({ message: "Monthly invoice cron complete", ...results, overdue: overdueResult.marked });
  } catch (error) {
    console.error("Monthly invoice cron failed:", error);
    return res.status(500).json({ message: "Monthly invoice cron failed" });
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
