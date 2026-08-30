import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { adminOnly } from "../middleware/adminMiddleware.js";
import {
  listInvoicesAdmin,
  getInvoiceDetailAdmin,
  generateInvoiceAdmin,
  bulkGenerateInvoices,
  regenerateInvoiceAdmin,
  updateInvoiceStatus,
  sendInvoiceWhatsApp,
  downloadInvoicePDF,
  listMyInvoices,
  getMyInvoiceDetail,
} from "../controllers/invoice.controller.js";

const router = express.Router();

// ── Admin routes ──────────────────────────────────────────────────────────
router.get("/admin", authMiddleware, adminOnly, listInvoicesAdmin);
router.get("/admin/:id", authMiddleware, adminOnly, getInvoiceDetailAdmin);
router.post("/admin/generate-bulk", authMiddleware, adminOnly, bulkGenerateInvoices);
router.post("/admin/generate/:userId", authMiddleware, adminOnly, generateInvoiceAdmin);
router.post("/admin/:id/regenerate", authMiddleware, adminOnly, regenerateInvoiceAdmin);
router.patch("/admin/:id/status", authMiddleware, adminOnly, updateInvoiceStatus);
router.post("/admin/:id/send-whatsapp", authMiddleware, adminOnly, sendInvoiceWhatsApp);
router.get("/admin/:id/pdf", authMiddleware, adminOnly, downloadInvoicePDF);

// ── Customer routes ───────────────────────────────────────────────────────
router.get("/my", authMiddleware, listMyInvoices);
router.get("/my/:id", authMiddleware, getMyInvoiceDetail);

export default router;
