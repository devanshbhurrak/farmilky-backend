import mongoose from "mongoose";
import Invoice from "../models/invoice.model.js";
import Counter from "../models/counter.model.js";
import User from "../models/user.model.js";
import { getLedgerEntries } from "../utils/ledgerUtils.js";

/**
 * Generate a unique invoice number: INV-YYYY-MM-NNN (zero-padded to 4 digits)
 */
async function generateInvoiceNumber(month, year, session) {
  const key = `invoice-${year}-${String(month).padStart(2, "0")}`;
  const counter = await Counter.findByIdAndUpdate(
    key,
    { $inc: { seq: 1 } },
    { new: true, upsert: true, session }
  );
  return `INV-${year}-${String(month).padStart(2, "0")}-${String(counter.seq).padStart(4, "0")}`;
}

/**
 * Get the previous balance for a customer:
 * - If there's a prior invoice, use its netAmountDue
 * - Otherwise return 0 (fresh start — passbook balance at start of period handled by charges/payments)
 */
async function getPreviousBalance(userId, month, year) {
  // Find the most recent non-void invoice before this period
  let targetYear = year;
  let targetMonth = month - 1;
  if (targetMonth < 1) { targetMonth = 12; targetYear -= 1; }

  const prior = await Invoice.findOne({
    userId,
    status: { $ne: "void" },
    $or: [
      { "billingPeriod.year": { $lt: year } },
      { "billingPeriod.year": year, "billingPeriod.month": { $lt: month } },
    ],
  }).sort({ "billingPeriod.year": -1, "billingPeriod.month": -1 });

  return prior ? prior.netAmountDue : 0;
}

/**
 * Build product summary from delivery line items.
 * Allocates payments proportionally across products.
 */
function buildProductSummary(deliveryEntries, totalPayments) {
  const productMap = new Map();

  deliveryEntries.forEach((entry) => {
    if (!entry.productId) return;
    const key = `${entry.productId}-${entry.variantLabel || ""}`;
    if (!productMap.has(key)) {
      productMap.set(key, {
        productId: entry.productId,
        productName: entry.productName || "Product",
        variantLabel: entry.variantLabel || "",
        unit: entry.unit || "",
        totalQuantity: 0,
        totalAmount: 0,
        rateBreakdown: [],
      });
    }
    const p = productMap.get(key);
    p.totalQuantity += entry.quantity || 0;
    p.totalAmount += entry.amount || 0;

    // Track rate breakdown if price differs
    const rate = entry.unitPrice || 0;
    const existing = p.rateBreakdown.find((r) => r.rate === rate);
    if (existing) {
      existing.quantity += entry.quantity || 0;
      existing.amount += entry.amount || 0;
    } else {
      p.rateBreakdown.push({ rate, quantity: entry.quantity || 0, amount: entry.amount || 0 });
    }
  });

  const totalCharges = Array.from(productMap.values()).reduce((s, p) => s + p.totalAmount, 0);

  return Array.from(productMap.values()).map((p) => {
    const avgRate = p.totalQuantity > 0 ? p.totalAmount / p.totalQuantity : 0;
    // Proportional payment allocation
    const share = totalCharges > 0 ? p.totalAmount / totalCharges : 0;
    const paidAmount = Math.min(p.totalAmount, share * Math.max(0, totalPayments));
    const outstandingAmount = Math.max(0, p.totalAmount - paidAmount);
    // Simplify rateBreakdown — remove if only one rate
    const rateBreakdown = p.rateBreakdown.length > 1 ? p.rateBreakdown : [];

    return {
      productId: p.productId,
      productName: p.productName,
      variantLabel: p.variantLabel,
      unit: p.unit,
      totalQuantity: Math.round(p.totalQuantity * 1000) / 1000,
      avgRate: Math.round(avgRate * 100) / 100,
      totalAmount: Math.round(p.totalAmount * 100) / 100,
      paidAmount: Math.round(paidAmount * 100) / 100,
      outstandingAmount: Math.round(outstandingAmount * 100) / 100,
      rateBreakdown,
    };
  });
}

/**
 * Generate (or regenerate) an invoice for a single customer.
 *
 * @param {string} userId
 * @param {number} month  1–12
 * @param {number} year
 * @param {{
 *   force?: boolean,           // regenerate even if invoice already exists
 *   isEarlyBilling?: boolean,
 *   billingCutoffDate?: Date,  // inclusive end date for early billing
 *   generatedBy?: "system"|"admin",
 *   generatedByUserId?: string,
 *   notes?: string,
 * }} options
 * @returns {{ invoice, action: "created"|"skipped"|"regenerated" }}
 */
export async function generateInvoice(userId, month, year, options = {}) {
  const {
    force = false,
    isEarlyBilling = false,
    billingCutoffDate,
    generatedBy = "system",
    generatedByUserId,
    notes,
  } = options;

  // Check for existing non-void invoice
  const existing = await Invoice.findOne({
    userId,
    "billingPeriod.month": month,
    "billingPeriod.year": year,
    status: { $ne: "void" },
  });

  if (existing && !force) {
    return { invoice: existing, action: "skipped" };
  }

  const user = await User.findById(userId).select("name phone accountBalance").lean();
  if (!user) throw new Error(`User ${userId} not found`);

  // Billing period: first day of month to last day (or cutoffDate for early billing)
  const startDate = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const defaultEndDate = new Date(year, month, 0, 23, 59, 59, 999); // last day of month
  const endDate = billingCutoffDate ? new Date(billingCutoffDate) : defaultEndDate;
  if (billingCutoffDate) endDate.setHours(23, 59, 59, 999);

  const { deliveryEntries, orderEntries, paymentEntries } = await getLedgerEntries(userId, {
    startDate,
    endDate,
  });

  // Compute totals
  const totalCharges = [...deliveryEntries, ...orderEntries]
    .filter((e) => e.type === "debit")
    .reduce((s, e) => s + (e.amount || 0), 0);

  const orderCredits = orderEntries
    .filter((e) => e.type === "credit")
    .reduce((s, e) => s + (e.amount || 0), 0);

  const totalPayments = paymentEntries
    .filter((e) => e.type === "credit")
    .reduce((s, e) => s + (e.amount || 0), 0);

  const totalAdjustments = paymentEntries
    .filter((e) => e.type === "debit" && e.paymentType === "debit_adjustment")
    .reduce((s, e) => s + (e.amount || 0), 0);

  const previousBalance = await getPreviousBalance(userId, month, year);
  const netAmountDue = Math.round(
    (previousBalance + totalCharges - totalPayments - orderCredits + totalAdjustments) * 100
  ) / 100;

  // Build line items
  const lineItems = [
    ...deliveryEntries.map((e) => ({
      date: e.date,
      description: e.description,
      category: e.category,
      referenceId: e.referenceId,
      referenceModel: e.referenceModel,
      quantity: e.quantity,
      unitPrice: e.unitPrice,
      amount: e.amount,
      productName: e.productName,
      variantLabel: e.variantLabel,
      unit: e.unit,
      entryType: e.entryType,
    })),
    ...orderEntries.map((e) => ({
      date: e.date,
      description: e.description,
      category: e.category,
      referenceId: e.referenceId,
      referenceModel: e.referenceModel,
      productName: e.productName,
      quantity: e.quantity,
      unitPrice: e.unitPrice,
      amount: e.amount,
      entryType: e.entryType,
    })),
    ...paymentEntries.map((e) => ({
      date: e.date,
      description: e.description,
      category: e.paymentType === "debit_adjustment" ? "Adjustment" : e.paymentType === "credit_adjustment" ? "Adjustment" : "Payment",
      referenceId: e.referenceId,
      referenceModel: e.referenceModel,
      amount: e.amount,
      entryType: e.entryType,
    })),
  ].sort((a, b) => new Date(a.date) - new Date(b.date));

  const productSummary = buildProductSummary(deliveryEntries, totalPayments);

  // Determine initial status
  let status = "draft";
  if (netAmountDue <= 0) status = "paid";

  const session = await mongoose.startSession();
  let invoice;
  try {
    await session.withTransaction(async () => {
      // Void the existing invoice if force-regenerating
      if (existing && force) {
        existing.status = "void";
        existing.voidReason = "Regenerated by " + (generatedBy === "admin" ? "admin" : "system");
        await existing.save({ session });
      }

      const invoiceNumber = await generateInvoiceNumber(month, year, session);

      const newInvoice = new Invoice({
        invoiceNumber,
        userId,
        billingPeriod: { month, year },
        previousBalance,
        totalCharges: Math.round(totalCharges * 100) / 100,
        orderCredits: Math.round(orderCredits * 100) / 100,
        totalPayments: Math.round(totalPayments * 100) / 100,
        totalAdjustments: Math.round(totalAdjustments * 100) / 100,
        netAmountDue,
        lineItems,
        productSummary,
        status,
        isEarlyBilling,
        billingCutoffDate: billingCutoffDate ? new Date(billingCutoffDate) : undefined,
        generatedBy,
        generatedByUser: generatedByUserId || undefined,
        notes,
      });

      if (existing && force) {
        newInvoice.voidedBy = existing._id;
        existing.replacedByInvoice = newInvoice._id;
        await existing.save({ session });
      }

      await newInvoice.save({ session });
      invoice = newInvoice;
    });
  } finally {
    await session.endSession();
  }

  return { invoice, action: existing && force ? "regenerated" : "created" };
}

/**
 * Bulk generate invoices for all active customers for a given month/year.
 * Processes in batches of 50.
 */
export async function generateBulkInvoices(month, year, options = {}) {
  // Find users who have deliveries or subscriptions (active customers)
  const users = await User.find({ role: "customer", isDeleted: { $ne: true } })
    .select("_id")
    .lean();

  const results = { generated: 0, skipped: 0, errors: [] };
  const BATCH_SIZE = 50;

  for (let i = 0; i < users.length; i += BATCH_SIZE) {
    const batch = users.slice(i, i + BATCH_SIZE);
    await Promise.allSettled(
      batch.map(async (u) => {
        try {
          const { action } = await generateInvoice(u._id.toString(), month, year, options);
          if (action === "skipped") results.skipped += 1;
          else results.generated += 1;
        } catch (err) {
          results.errors.push({ userId: u._id, error: err.message });
        }
      })
    );
  }

  return results;
}

/**
 * Sync invoice status after a payment is recorded.
 * Called from payment.controller.js after a successful payment save.
 */
export async function syncInvoiceStatusAfterPayment(userId) {
  try {
    // Find the most recent non-void invoice for this user (include paid so
    // payment deletions can downgrade a "paid" invoice back to draft)
    const invoice = await Invoice.findOne({
      userId,
      status: { $nin: ["void", "cancelled"] },
    }).sort({ "billingPeriod.year": -1, "billingPeriod.month": -1 });

    if (!invoice) return;

    // Re-compute payments only (charges and order credits don't change after a payment)
    const startDate = new Date(invoice.billingPeriod.year, invoice.billingPeriod.month - 1, 1);
    const endDate = invoice.billingCutoffDate
      ? new Date(invoice.billingCutoffDate)
      : new Date(invoice.billingPeriod.year, invoice.billingPeriod.month, 0, 23, 59, 59, 999);

    const { paymentEntries } = await getLedgerEntries(userId, { startDate, endDate });
    const totalPayments = paymentEntries
      .filter((e) => e.type === "credit")
      .reduce((s, e) => s + e.amount, 0);

    const totalAdjustments = paymentEntries
      .filter((e) => e.type === "debit" && e.paymentType === "debit_adjustment")
      .reduce((s, e) => s + e.amount, 0);

    // Use stored orderCredits (defaults to 0 for invoices generated before this field was added)
    const orderCredits = invoice.orderCredits ?? 0;

    const newNet = Math.round(
      (invoice.previousBalance + invoice.totalCharges - orderCredits - totalPayments + totalAdjustments) * 100
    ) / 100;

    invoice.totalPayments = Math.round(totalPayments * 100) / 100;
    invoice.totalAdjustments = Math.round(totalAdjustments * 100) / 100;
    invoice.netAmountDue = newNet;

    if (newNet <= 0) {
      invoice.status = "paid";
      if (!invoice.paidAt) invoice.paidAt = new Date();
    } else if (totalPayments > 0) {
      invoice.status = "partially_paid";
      invoice.paidAt = undefined; // clear paidAt if it was set prematurely
    } else {
      // No payments remain (e.g. payment was deleted) — revert to the appropriate
      // unpaid state: preserve "overdue" and "sent" rather than blindly downgrading to "draft"
      if (!["overdue", "sent"].includes(invoice.status)) {
        invoice.status = "draft";
      }
      invoice.paidAt = undefined;
    }

    await invoice.save();
  } catch (err) {
    // Non-critical — log and continue
    console.error("[InvoiceSync] Failed to sync invoice status after payment:", err.message);
  }
}

/**
 * Mark unpaid invoices from prior months as overdue.
 * Called by monthly cron before generating new invoices.
 * @returns {{ marked: number }}
 */
export async function markOverdueInvoices() {
  const now = new Date();
  // Invoices from any period before this month that are not paid/void/cancelled
  const result = await Invoice.updateMany(
    {
      status: { $in: ["draft", "sent", "partially_paid"] },
      $or: [
        { "billingPeriod.year": { $lt: now.getFullYear() } },
        {
          "billingPeriod.year": now.getFullYear(),
          "billingPeriod.month": { $lt: now.getMonth() + 1 },
        },
      ],
      netAmountDue: { $gt: 0 },
    },
    { $set: { status: "overdue" } }
  );
  return { marked: result.modifiedCount };
}
