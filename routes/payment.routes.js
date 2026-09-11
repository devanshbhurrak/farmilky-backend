import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { adminOnly, deliveryPartnerOrAdmin } from "../middleware/adminMiddleware.js";
import { requirePermission } from "../middleware/permissionMiddleware.js";
import { recordPaymentAdmin, updatePaymentAdmin, deletePaymentAdmin } from "../controllers/payment.controller.js";
import { getCustomerPassbook, getMyPassbook } from "../controllers/passbook.controller.js";

const router = express.Router();

// Payment Routes — delivery partners require collection.record permission
router.post("/admin/record", authMiddleware, deliveryPartnerOrAdmin, requirePermission("collection.record"), recordPaymentAdmin);
router.put("/admin/:id", authMiddleware, adminOnly, updatePaymentAdmin);
router.delete("/admin/:id", authMiddleware, adminOnly, deletePaymentAdmin);

// Passbook Routes
router.get("/my-passbook", authMiddleware, getMyPassbook);
router.get("/:userId", authMiddleware, adminOnly, getCustomerPassbook);

export default router;
