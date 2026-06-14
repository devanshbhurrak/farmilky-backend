import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { adminOnly } from "../middleware/adminMiddleware.js";
import { requestReturn, getMyReturns, getAllReturnsAdmin, updateReturnStatus } from "../controllers/return.controller.js";

const router = express.Router();

router.post("/", authMiddleware, requestReturn);
router.get("/my", authMiddleware, getMyReturns);
router.get("/admin/all", authMiddleware, adminOnly, getAllReturnsAdmin);
router.put("/admin/:id/status", authMiddleware, adminOnly, updateReturnStatus);

export default router;
