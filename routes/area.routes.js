import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { adminOnly, deliveryPartnerOrAdmin } from "../middleware/adminMiddleware.js";
import { createArea, getAllAreas, getAreaById, updateArea, deleteArea, getDeliveryAgents, getAreaCustomers, updateAreaCustomers } from "../controllers/area.controller.js";

const router = express.Router();

router.get("/agents", authMiddleware, adminOnly, getDeliveryAgents);
router.get("/", authMiddleware, deliveryPartnerOrAdmin, getAllAreas);
router.post("/", authMiddleware, adminOnly, createArea);
router.get("/:id", authMiddleware, adminOnly, getAreaById);
router.put("/:id", authMiddleware, adminOnly, updateArea);
router.delete("/:id", authMiddleware, adminOnly, deleteArea);
router.get("/:id/customers", authMiddleware, adminOnly, getAreaCustomers);
router.put("/:id/customers", authMiddleware, adminOnly, updateAreaCustomers);

export default router;
