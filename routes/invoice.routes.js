import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { getMyInvoices } from "../controllers/invoice.controller.js";

const router = express.Router();

router.get("/my-invoices", authMiddleware, getMyInvoices)

export default router;
