import express from "express";
import {
  createOrder,
  getUserOrders,
  getOrderById,
  cancelOrder,
  updateOrderStatus,
  getAllOrder,
} from "../controllers/order.controller.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { adminOnly } from "../middleware/adminMiddleware.js";

const router = express.Router();

// Admin routes
router.get("/admin/all", authMiddleware, adminOnly, getAllOrder);
router.put("/admin/:id/status", authMiddleware, adminOnly, updateOrderStatus);

// User routes
router.post("/", authMiddleware, createOrder);
router.get("/", authMiddleware, getUserOrders);
router.get("/:id", authMiddleware, getOrderById);
router.put("/:id/cancel", authMiddleware, cancelOrder);

export default router;
