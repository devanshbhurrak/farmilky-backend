import express from "express";
import { submitContactMessage, getAllContactMessagesAdmin, updateContactMessageStatus } from "../controllers/contact.controller.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { adminOnly } from "../middleware/adminMiddleware.js";

const router = express.Router();

router.post("/", submitContactMessage);
router.get("/admin/all", authMiddleware, adminOnly, getAllContactMessagesAdmin);
router.patch("/admin/:id/status", authMiddleware, adminOnly, updateContactMessageStatus);

export default router;
