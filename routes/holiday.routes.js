import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { adminOnly } from "../middleware/adminMiddleware.js";
import { createHoliday, getAllHolidays, updateHoliday, deleteHoliday } from "../controllers/holiday.controller.js";

const router = express.Router();

router.get("/", authMiddleware, getAllHolidays);
router.post("/", authMiddleware, adminOnly, createHoliday);
router.put("/:id", authMiddleware, adminOnly, updateHoliday);
router.delete("/:id", authMiddleware, adminOnly, deleteHoliday);

export default router;
