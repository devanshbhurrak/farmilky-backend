import express from "express";
import {
  runDailyDeliveryCron,
  runMonthlyInvoiceCron,
} from "../controllers/cron.controller.js";

const router = express.Router();

router.get("/daily-delivery", runDailyDeliveryCron);
router.get("/monthly-invoices", runMonthlyInvoiceCron);

export default router;
