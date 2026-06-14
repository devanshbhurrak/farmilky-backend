import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { adminOnly } from "../middleware/adminMiddleware.js";
import { createArea, getAllAreas, getAreaById, updateArea, deleteArea, getDeliveryAgents } from "../controllers/area.controller.js";

const router = express.Router();

router.get("/agents", authMiddleware, adminOnly, getDeliveryAgents);
router.get("/", authMiddleware, adminOnly, getAllAreas);
router.post("/", authMiddleware, adminOnly, createArea);
router.get("/:id", authMiddleware, adminOnly, getAreaById);
router.put("/:id", authMiddleware, adminOnly, updateArea);
router.delete("/:id", authMiddleware, adminOnly, deleteArea);

export default router;
