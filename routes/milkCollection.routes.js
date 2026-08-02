import { Router } from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { adminOnly } from "../middleware/adminMiddleware.js";
import {
  generateDailyCollections,
  getDailyConfirmation,
  confirmCollection,
  bulkConfirmDay,
  getCollectionHistory,
  updateCollection,
  getMissingCollections,
  getTodayShiftSummary,
} from "../controllers/milkCollection.controller.js";

const router = Router();

router.use(authMiddleware, adminOnly);

// Daily confirmation workflow
router.get("/today-shift", getTodayShiftSummary);
router.get("/daily", getDailyConfirmation);
router.post("/generate", generateDailyCollections);
router.post("/bulk-confirm", bulkConfirmDay);

// Missing entries check
router.get("/missing", getMissingCollections);

// History and CRUD
router.get("/", getCollectionHistory);
router.post("/:id/confirm", confirmCollection);
router.put("/:id", updateCollection);

export default router;
