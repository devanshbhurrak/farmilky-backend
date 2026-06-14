import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { adminOnly } from "../middleware/adminMiddleware.js";
import { getAdminStats, getDeliveryPerformance } from "../controllers/admin.controller.js";
import { bulkPauseSubscriptions, bulkResumeSubscriptions } from "../controllers/subscription.controller.js";

const router = express.Router();

router.get("/stats", authMiddleware, adminOnly, getAdminStats);
router.get("/delivery-performance", authMiddleware, adminOnly, getDeliveryPerformance);
router.put("/subscriptions/bulk-pause", authMiddleware, adminOnly, bulkPauseSubscriptions);
router.put("/subscriptions/bulk-resume", authMiddleware, adminOnly, bulkResumeSubscriptions);

export default router;
