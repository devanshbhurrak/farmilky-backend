import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { adminOnly } from "../middleware/adminMiddleware.js";
import { recordPaymentAdmin, deletePaymentAdmin } from "../controllers/payment.controller.js";
import { getCustomerPassbook, getMyPassbook } from "../controllers/passbook.controller.js";

const router = express.Router();

// Admin Payment Routes
router.post("/admin/record", authMiddleware, adminOnly, recordPaymentAdmin);
router.delete("/admin/:id", authMiddleware, adminOnly, deletePaymentAdmin);

// Passbook Routes
router.get("/my-passbook", authMiddleware, getMyPassbook);
router.get("/:userId", authMiddleware, adminOnly, getCustomerPassbook);

export default router;
