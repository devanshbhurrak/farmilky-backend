import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { adminOnly } from "../middleware/adminMiddleware.js";
import { idempotencyMiddleware } from "../middleware/idempotencyMiddleware.js";
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
  downloadMyInvoicePDF,
} from "../controllers/invoice.controller.js";

const router = express.Router();

// ── Admin routes ──────────────────────────────────────────────────────────
router.get("/admin", authMiddleware, adminOnly, listInvoicesAdmin);
router.post("/admin/generate-bulk", authMiddleware, adminOnly, idempotencyMiddleware, bulkGenerateInvoices);
router.get("/admin/:id/pdf", authMiddleware, adminOnly, downloadInvoicePDF);
router.get("/admin/:id", authMiddleware, adminOnly, getInvoiceDetailAdmin);
router.post("/admin/generate/:userId", authMiddleware, adminOnly, idempotencyMiddleware, generateInvoiceAdmin);
router.post("/admin/:id/regenerate", authMiddleware, adminOnly, regenerateInvoiceAdmin);
router.patch("/admin/:id/status", authMiddleware, adminOnly, updateInvoiceStatus);
router.post("/admin/:id/send-whatsapp", authMiddleware, adminOnly, sendInvoiceWhatsApp);

// ── Customer routes ───────────────────────────────────────────────────────
router.get("/my", authMiddleware, listMyInvoices);
router.get("/my/:id/pdf", authMiddleware, downloadMyInvoicePDF);
router.get("/my/:id", authMiddleware, getMyInvoiceDetail);

export default router;
