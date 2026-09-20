import Invoice from "../models/invoice.model.js";
import User from "../models/user.model.js";
import {
  generateInvoice,
  generateBulkInvoices,
} from "../services/invoiceService.js";
import { generateInvoicePDF } from "../services/pdfService.js";
import { sendInvoiceViaWhatsApp } from "../services/whatsappService.js";

// ── Admin: List invoices ─────────────────────────────────────────────────
export const listInvoicesAdmin = async (req, res) => {
  try {
    const {
      month, year, status, userId, search,
      page = 1, limit = 50, sortBy, sortOrder,
    } = req.query;
    const { parsePagination, buildPaginationMeta, escapeRegex, buildSearchOr } = await import("../utils/pagination.js");
    const { page: p, limit: lim, skip, sort } = parsePagination(
      { page, limit, sortBy, sortOrder },
      { defaultLimit: 50, maxLimit: 100, defaultSort: { "billingPeriod.year": -1, "billingPeriod.month": -1, createdAt: -1 }, allowedSortFields: ["createdAt","billingPeriod.year","status","netAmountDue","totalCharges"] }
    );

    const filter = {};
    if (month) filter["billingPeriod.month"] = Number(month);
    if (year) filter["billingPeriod.year"] = Number(year);
    if (status) filter.status = status;
    if (userId) filter.userId = userId;
    if (search) {
      const esc = escapeRegex(search.trim());
      const matchedUsers = await User.find({ $or: buildSearchOr(esc, ["name","phone","email"]) }).select("_id").lean();
      const userIds = matchedUsers.map((u) => u._id);
      filter.$or = [
        { invoiceNumber: { $regex: esc, $options: "i" } },
        ...(userIds.length ? [{ userId: { $in: userIds } }] : []),
      ];
    }

    // Use computed sort unless custom sort requested
    const effectiveSort = sortBy ? sort : { "billingPeriod.year": -1, "billingPeriod.month": -1, createdAt: -1 };
    const [invoices, total] = await Promise.all([
      Invoice.find(filter)
        .populate("userId", "name phone email")
        .sort(effectiveSort)
        .skip(skip)
        .limit(lim)
        .lean(),
      Invoice.countDocuments(filter),
    ]);

    res.json({ invoices, ...buildPaginationMeta(total, p, lim) });
  } catch (err) {
    console.error("listInvoicesAdmin:", err);
    res.status(500).json({ message: "Failed to list invoices" });
  }
};

// ── Admin: Invoice detail ────────────────────────────────────────────────
export const getInvoiceDetailAdmin = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id)
      .populate("userId", "name phone email accountBalance")
      .populate("generatedByUser", "name")
      .populate("voidedBy", "invoiceNumber")
      .populate("replacedByInvoice", "invoiceNumber status")
      .lean();

    if (!invoice) return res.status(404).json({ message: "Invoice not found" });
    res.json({ invoice });
  } catch (err) {
    console.error("getInvoiceDetailAdmin:", err);
    res.status(500).json({ message: "Failed to fetch invoice" });
  }
};

// ── Admin: Generate single invoice ──────────────────────────────────────
export const generateInvoiceAdmin = async (req, res) => {
  try {
    const { userId } = req.params;
    const {
      month, year, force = false,
      isEarlyBilling = false, billingCutoffDate, notes,
    } = req.body;

    const m = Number(month), y = Number(year);
    if (!m || !y || m < 1 || m > 12 || y < 2020 || y > 2100) {
      return res.status(400).json({ message: "Valid month (1-12) and year are required" });
    }

    const result = await generateInvoice(userId, m, y, {
      force: Boolean(force),
      isEarlyBilling: Boolean(isEarlyBilling),
      billingCutoffDate: billingCutoffDate ? new Date(billingCutoffDate) : undefined,
      generatedBy: "admin",
      generatedByUserId: req.user._id,
      notes,
    });

    const statusCode = result.action === "skipped" ? 200 : 201;
    res.status(statusCode).json({
      message: result.action === "skipped"
        ? "Invoice already exists for this period. Use force=true to regenerate."
        : result.action === "regenerated"
          ? "Invoice regenerated successfully."
          : "Invoice generated successfully.",
      invoice: result.invoice,
      action: result.action,
    });
  } catch (err) {
    console.error("generateInvoiceAdmin:", err);
    res.status(500).json({ message: err.message || "Failed to generate invoice" });
  }
};

// ── Admin: Bulk generate invoices ────────────────────────────────────────
export const bulkGenerateInvoices = async (req, res) => {
  try {
    const { month, year, force = false, isEarlyBilling, billingCutoffDate } = req.body;
    const m = Number(month), y = Number(year);
    if (!m || !y || m < 1 || m > 12 || y < 2020 || y > 2100) {
      return res.status(400).json({ message: "Valid month (1-12) and year are required" });
    }

    const results = await generateBulkInvoices(m, y, {
      force: Boolean(force),
      isEarlyBilling: Boolean(isEarlyBilling),
      billingCutoffDate: billingCutoffDate || undefined,
      generatedBy: "admin",
      generatedByUserId: req.user._id,
    });

    res.json({
      message: `Bulk generation complete: ${results.generated} generated, ${results.skipped} skipped, ${results.errors.length} errors.`,
      ...results,
    });
  } catch (err) {
    console.error("bulkGenerateInvoices:", err);
    res.status(500).json({ message: "Bulk generation failed" });
  }
};

// ── Admin: Regenerate (void + recreate) ─────────────────────────────────
export const regenerateInvoiceAdmin = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ message: "Invoice not found" });

    const result = await generateInvoice(
      invoice.userId.toString(),
      invoice.billingPeriod.month,
      invoice.billingPeriod.year,
      {
        force: true,
        isEarlyBilling: invoice.isEarlyBilling,
        billingCutoffDate: invoice.billingCutoffDate,
        generatedBy: "admin",
        generatedByUserId: req.user._id,
        notes: req.body.notes,
      }
    );

    res.json({ message: "Invoice regenerated.", invoice: result.invoice });
  } catch (err) {
    console.error("regenerateInvoiceAdmin:", err);
    res.status(500).json({ message: err.message || "Failed to regenerate invoice" });
  }
};

// ── Admin: Update status ─────────────────────────────────────────────────
export const updateInvoiceStatus = async (req, res) => {
  try {
    const { status, voidReason } = req.body;
    const validStatuses = ["draft", "sent", "paid", "partially_paid", "overdue", "cancelled", "void"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ message: "Invoice not found" });

    // Prevent changing status of an already-void invoice (except via regenerate)
    if (invoice.status === "void" && status !== "void") {
      return res.status(400).json({ message: "Cannot update status of a voided invoice. Regenerate it instead." });
    }

    if (status === "void" && !voidReason?.trim()) {
      return res.status(400).json({ message: "A reason is required when voiding an invoice." });
    }

    invoice.status = status;
    if (status === "void") invoice.voidReason = voidReason.trim();
    if (status === "paid") invoice.paidAt = new Date();
    if (status === "sent" && !invoice.sentAt) {
      invoice.sentAt = new Date();
      invoice.sentVia = "whatsapp";
    }
    await invoice.save();

    res.json({ message: "Status updated.", invoice });
  } catch (err) {
    console.error("updateInvoiceStatus:", err);
    res.status(500).json({ message: "Failed to update status" });
  }
};

// ── Admin: Send via WhatsApp ──────────────────────────────────────────────
export const sendInvoiceWhatsApp = async (req, res) => {
  try {
    const result = await sendInvoiceViaWhatsApp(req.params.id);
    res.json(result);
  } catch (err) {
    console.error("sendInvoiceWhatsApp:", err);
    res.status(500).json({ message: err.message || "Failed to send invoice" });
  }
};

// ── Admin: Download PDF ──────────────────────────────────────────────────
export const downloadInvoicePDF = async (req, res) => {
  try {
    const { detailed = "false", upiId, upiName, phone } = req.query;
    const invoice = await Invoice.findById(req.params.id)
      .populate("userId", "name phone email")
      .lean();

    if (!invoice) return res.status(404).json({ message: "Invoice not found" });

    const pdfBuffer = await generateInvoicePDF(invoice, {
      detailed: detailed === "true",
      // Frontend passes its VITE_UPI_ID so the PDF shows QR/UPI even when
      // the backend UPI_ID env var is not set separately.
      ...(upiId   ? { upiId }   : {}),
      ...(upiName ? { upiName } : {}),
      ...(phone   ? { phone }   : {}),
    });

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${invoice.invoiceNumber}.pdf"`,
      "Content-Length": pdfBuffer.length,
    });
    res.end(pdfBuffer);
  } catch (err) {
    console.error("downloadInvoicePDF:", err);
    res.status(500).json({ message: "Failed to generate PDF" });
  }
};

// ── Customer: List my invoices ───────────────────────────────────────────
export const listMyInvoices = async (req, res) => {
  try {
    const { month, year, page = 1, limit = 12 } = req.query;
    const filter = { userId: req.user._id, status: { $ne: "void" } };
    if (month) filter["billingPeriod.month"] = Number(month);
    if (year) filter["billingPeriod.year"] = Number(year);

    const skip = (Number(page) - 1) * Number(limit);
    const [invoices, total] = await Promise.all([
      Invoice.find(filter)
        .sort({ "billingPeriod.year": -1, "billingPeriod.month": -1 })
        .skip(skip)
        .limit(Number(limit))
        .select("-lineItems") // compact list — line items only in detail
        .lean(),
      Invoice.countDocuments(filter),
    ]);

    res.json({ invoices, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error("listMyInvoices:", err);
    res.status(500).json({ message: "Failed to fetch invoices" });
  }
};

// ── Customer: My invoice detail ──────────────────────────────────────────
export const getMyInvoiceDetail = async (req, res) => {
  try {
    const invoice = await Invoice.findOne({
      _id: req.params.id,
      userId: req.user._id,
      status: { $ne: "void" },
    }).lean();

    if (!invoice) return res.status(404).json({ message: "Invoice not found" });

    // Include brand payment config so the portal can show payment options
    // Fallbacks must match pdfService.js so portal and PDF show the same info
    const brandConfig = {
      phone:   process.env.BRAND_PHONE || "9244237975",
      upiId:   process.env.UPI_ID      || "",
      upiName: process.env.UPI_NAME    || "Farmilky",
    };

    res.json({ invoice, brandConfig });
  } catch (err) {
    console.error("getMyInvoiceDetail:", err);
    res.status(500).json({ message: "Failed to fetch invoice" });
  }
};

// ── Customer: Download my invoice PDF ───────────────────────────────────
export const downloadMyInvoicePDF = async (req, res) => {
  try {
    const { detailed = "false" } = req.query;
    const invoice = await Invoice.findOne({
      _id: req.params.id,
      userId: req.user._id,
      status: { $ne: "void" },
    })
      .populate("userId", "name phone email")
      .lean();

    if (!invoice) return res.status(404).json({ message: "Invoice not found" });

    const pdfBuffer = await generateInvoicePDF(invoice, {
      detailed: detailed === "true",
    });

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${invoice.invoiceNumber}.pdf"`,
      "Content-Length": pdfBuffer.length,
    });
    res.end(pdfBuffer);
  } catch (err) {
    console.error("downloadMyInvoicePDF:", err);
    res.status(500).json({ message: "Failed to generate PDF" });
  }
};
