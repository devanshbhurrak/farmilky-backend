import express from "express";
import {
  runDailyDeliveryCron,
  runEndOfDayCron,
} from "../controllers/cron.controller.js";

const router = express.Router();

router.post("/daily-delivery", runDailyDeliveryCron);
router.post("/end-of-day", runEndOfDayCron);

export default router;
