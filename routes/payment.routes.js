import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { adminOnly, deliveryPartnerOrAdmin } from "../middleware/adminMiddleware.js";
import { recordPaymentAdmin, deletePaymentAdmin } from "../controllers/payment.controller.js";
import { getCustomerPassbook, getMyPassbook } from "../controllers/passbook.controller.js";

const router = express.Router();

// Payment Routes (admins and delivery partners)
router.post("/admin/record", authMiddleware, deliveryPartnerOrAdmin, recordPaymentAdmin);
router.delete("/admin/:id", authMiddleware, adminOnly, deletePaymentAdmin);

// Passbook Routes
router.get("/my-passbook", authMiddleware, getMyPassbook);
router.get("/:userId", authMiddleware, adminOnly, getCustomerPassbook);

export default router;
