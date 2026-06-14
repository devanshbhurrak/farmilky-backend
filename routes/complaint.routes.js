import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { adminOnly } from "../middleware/adminMiddleware.js";
import {
  createComplaint,
  getMyComplaints,
  getComplaintById,
  getAllComplaintsAdmin,
  updateComplaintStatus,
} from "../controllers/complaint.controller.js";

const router = express.Router();

router.post("/", authMiddleware, createComplaint);
router.get("/my", authMiddleware, getMyComplaints);
router.get("/my/:id", authMiddleware, getComplaintById);
router.get("/admin/all", authMiddleware, adminOnly, getAllComplaintsAdmin);
router.put("/admin/:id/status", authMiddleware, adminOnly, updateComplaintStatus);

export default router;
