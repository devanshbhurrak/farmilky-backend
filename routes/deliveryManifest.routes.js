import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { adminOnly, deliveryPartnerOrAdmin } from "../middleware/adminMiddleware.js";
import {
  generateDailyManifests,
  getManifestsByDate,
  getManifestById,
  getMyTodayManifest,
  getMyManifestHistory,
  updateManifestEntry,
  resequenceManifest,
} from "../controllers/deliveryManifest.controller.js";

const router = express.Router();

// Agent routes — must come before /:id to avoid conflicts
router.get("/my/today", authMiddleware, deliveryPartnerOrAdmin, getMyTodayManifest);
router.get("/my/history", authMiddleware, deliveryPartnerOrAdmin, getMyManifestHistory);

// Admin routes
router.post("/generate", authMiddleware, adminOnly, generateDailyManifests);
router.get("/", authMiddleware, adminOnly, getManifestsByDate);
router.get("/:id", authMiddleware, deliveryPartnerOrAdmin, getManifestById);

// Admin resequence
router.put("/:id/resequence", authMiddleware, adminOnly, resequenceManifest);

// Agent entry update
router.put("/:id/entries/:entryId", authMiddleware, deliveryPartnerOrAdmin, updateManifestEntry);

export default router;
