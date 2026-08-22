import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { adminOnly, deliveryPartnerOrAdmin } from "../middleware/adminMiddleware.js";
import { requirePermission } from "../middleware/permissionMiddleware.js";
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

// Agent routes — permission-gated; must come before /:id to avoid conflicts
router.get("/my/today",   authMiddleware, deliveryPartnerOrAdmin, requirePermission("manifest.view_today"),   getMyTodayManifest);
router.get("/my/history", authMiddleware, deliveryPartnerOrAdmin, requirePermission("manifest.view_history"), getMyManifestHistory);

// Admin routes
router.post("/generate", authMiddleware, adminOnly, generateDailyManifests);
router.get("/", authMiddleware, adminOnly, getManifestsByDate);
router.get("/:id", authMiddleware, deliveryPartnerOrAdmin, getManifestById);

// Admin resequence
router.put("/:id/resequence", authMiddleware, adminOnly, resequenceManifest);

// Agent entry update — permission-gated
router.put("/:id/entries/:entryId", authMiddleware, deliveryPartnerOrAdmin, requirePermission("manifest.update"), updateManifestEntry);

export default router;
