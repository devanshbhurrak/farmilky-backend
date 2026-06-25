import express from "express";
import {
  runDailyDeliveryCron,
  runEndOfDayCron,
} from "../controllers/cron.controller.js";

const router = express.Router();

const cronAuth = (req, res, next) => {
  const authHeader = req.headers.authorization || "";
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return res.status(401).json({ message: "Unauthorized cron request" });
  }
  next();
};

router.post("/daily-delivery", cronAuth, runDailyDeliveryCron);
router.post("/end-of-day", cronAuth, runEndOfDayCron);

export default router;
