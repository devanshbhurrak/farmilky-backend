import express from "express";
import {
  createOrder,
  createOrderAdmin,
  createInstantDelivery,
  updateOrderAdmin,
  getUserOrders,
  getOrderById,
  cancelOrder,
  recordOrderDeliveryOutcome,
  updateOrderStatus,
  getAllOrder,
  getOrderByIdAdmin,
} from "../controllers/order.controller.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { adminOnly, deliveryPartnerOrAdmin } from "../middleware/adminMiddleware.js";
import { idempotencyMiddleware } from "../middleware/idempotencyMiddleware.js";

const router = express.Router();

// Admin routes
router.get("/admin/all", authMiddleware, adminOnly, getAllOrder);
router.get("/admin/:id", authMiddleware, adminOnly, getOrderByIdAdmin);
router.post("/admin/:id/delivery-outcome", authMiddleware, deliveryPartnerOrAdmin, idempotencyMiddleware, recordOrderDeliveryOutcome);
router.put("/admin/:id/status", authMiddleware, deliveryPartnerOrAdmin, updateOrderStatus);
router.post("/admin/create", authMiddleware, adminOnly, createOrderAdmin);
router.post("/admin/instant-delivery", authMiddleware, adminOnly, idempotencyMiddleware, createInstantDelivery);
router.put("/admin/:id", authMiddleware, adminOnly, updateOrderAdmin);

// User routes
router.post("/", authMiddleware, createOrder);
router.get("/", authMiddleware, getUserOrders);
router.get("/:id", authMiddleware, getOrderById);
router.put("/:id/cancel", authMiddleware, cancelOrder);

export default router;
