/**
 * PDF Invoice Generator
 * Uses pdfkit to generate professional invoice PDFs.
 * Install: npm install pdfkit
 */
import PDFDocument from "pdfkit";

const BRAND = {
  name: "Farmilky",
  tagline: "Fresh Dairy, Delivered Daily",
  address: "Your City, India",
  phone: "+91 XXXXXXXXXX",
  email: "hello@farmilky.com",
  primary: "#386641",   // forest green
  muted: "#6b7280",
  light: "#f3f4f6",
  border: "#e5e7eb",
  danger: "#dc2626",
  text: "#111827",
};

function formatCurrency(amount) {
  return `Rs. ${(amount ?? 0).toFixed(2)}`;
}

function formatDate(date) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function monthName(month, year) {
  return new Date(year, month - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

const STATUS_LABELS = {
  draft: "DRAFT",
  sent: "SENT",
  paid: "PAID",
  partially_paid: "PARTIALLY PAID",
  overdue: "OVERDUE",
  cancelled: "CANCELLED",
  void: "VOID",
};

/**
 * Generate an invoice PDF.
 * @param {object} invoice - Populated Invoice document (userId populated with name/phone)
 * @param {{ detailed?: boolean }} options
 * @returns {Promise<Buffer>}
 */
export async function generateInvoicePDF(invoice, { detailed = false } = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: "A4" });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const W = doc.page.width - 80; // usable width
    const L = 40;  // left margin

    // ── Header ──────────────────────────────────────────────────────────
    doc.rect(0, 0, doc.page.width, 80).fill(BRAND.primary);
    doc.fillColor("#fff").fontSize(22).font("Helvetica-Bold")
      .text(BRAND.name, L, 22, { width: W / 2 });
    doc.fontSize(9).font("Helvetica")
      .text(BRAND.tagline, L, 46, { width: W / 2 });

    // Invoice details (top-right)
    doc.fillColor("#fff").fontSize(9).font("Helvetica-Bold")
      .text(`Invoice: ${invoice.invoiceNumber}`, L + W / 2, 20, { width: W / 2, align: "right" });
    doc.font("Helvetica")
      .text(`Period: ${monthName(invoice.billingPeriod.month, invoice.billingPeriod.year)}`, L + W / 2, 35, { width: W / 2, align: "right" })
      .text(`Generated: ${formatDate(invoice.createdAt)}`, L + W / 2, 47, { width: W / 2, align: "right" })
      .text(`Status: ${STATUS_LABELS[invoice.status] || invoice.status.toUpperCase()}`, L + W / 2, 59, { width: W / 2, align: "right" });

    let y = 100;

    // ── Customer Info ────────────────────────────────────────────────────
    doc.fillColor(BRAND.text).fontSize(10).font("Helvetica-Bold")
      .text("Billed To:", L, y);
    y += 14;
    doc.fontSize(9).font("Helvetica")
      .text(invoice.userId?.name || "Customer", L, y);
    y += 12;
    if (invoice.userId?.phone) {
      doc.text(`Phone: ${invoice.userId.phone}`, L, y);
      y += 12;
    }
    y += 8;

    // ── Separator ────────────────────────────────────────────────────────
    doc.moveTo(L, y).lineTo(L + W, y).strokeColor(BRAND.border).lineWidth(1).stroke();
    y += 12;

    // ── Product Summary Table ────────────────────────────────────────────
    if (invoice.productSummary && invoice.productSummary.length > 0) {
      doc.fillColor(BRAND.text).fontSize(10).font("Helvetica-Bold")
        .text("Product Summary", L, y);
      y += 14;

      // Table header
      const cols = [
        { label: "Product", x: L, w: 160 },
        { label: "Qty", x: L + 160, w: 55, align: "right" },
        { label: "Rate", x: L + 215, w: 65, align: "right" },
        { label: "Amount", x: L + 280, w: 70, align: "right" },
        { label: "Paid", x: L + 350, w: 65, align: "right" },
        { label: "Outstanding", x: L + 415, w: 80, align: "right" },
      ];

      doc.rect(L, y, W, 18).fill(BRAND.light);
      cols.forEach((col) => {
        doc.fillColor(BRAND.muted).fontSize(8).font("Helvetica-Bold")
          .text(col.label, col.x + 2, y + 5, { width: col.w - 4, align: col.align || "left" });
      });
      y += 18;

      doc.strokeColor(BRAND.border).lineWidth(0.5);
      invoice.productSummary.forEach((p, i) => {
        if (i % 2 === 1) doc.rect(L, y, W, 18).fill("#fafafa");
        const label = p.variantLabel ? `${p.productName} (${p.variantLabel})` : p.productName;
        doc.fillColor(BRAND.text).fontSize(8).font("Helvetica")
          .text(label, cols[0].x + 2, y + 5, { width: cols[0].w - 4 })
          .text(`${p.totalQuantity} ${p.unit || ""}`, cols[1].x, y + 5, { width: cols[1].w - 4, align: "right" })
          .text(`Rs.${p.avgRate.toFixed(2)}`, cols[2].x, y + 5, { width: cols[2].w - 4, align: "right" })
          .text(formatCurrency(p.totalAmount), cols[3].x, y + 5, { width: cols[3].w - 4, align: "right" })
          .text(formatCurrency(p.paidAmount), cols[4].x, y + 5, { width: cols[4].w - 4, align: "right" });
        doc.fillColor(p.outstandingAmount > 0 ? BRAND.danger : BRAND.primary)
          .text(formatCurrency(p.outstandingAmount), cols[5].x, y + 5, { width: cols[5].w - 4, align: "right" });
        doc.moveTo(L, y + 18).lineTo(L + W, y + 18).stroke();
        y += 18;
      });

      y += 10;
    }

    // ── Invoice Summary Box ───────────────────────────────────────────────
    doc.moveTo(L, y).lineTo(L + W, y).strokeColor(BRAND.border).lineWidth(1).stroke();
    y += 10;

    doc.fillColor(BRAND.text).fontSize(10).font("Helvetica-Bold")
      .text("Invoice Summary", L, y);
    y += 14;

    function summaryRow(label, value, bold = false, color = BRAND.text) {
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9)
        .fillColor(BRAND.muted).text(label, L + 10, y, { width: 220 })
        .fillColor(color).text(value, L + 230, y, { width: W - 230, align: "right" });
      y += 14;
    }

    if (invoice.previousBalance !== 0) {
      summaryRow("Previous Balance B/F", formatCurrency(invoice.previousBalance),
        false, invoice.previousBalance > 0 ? BRAND.danger : BRAND.primary);
    }
    summaryRow("Total Charges This Period", formatCurrency(invoice.totalCharges));
    if (invoice.orderCredits > 0) {
      summaryRow("Order Credits", `(${formatCurrency(invoice.orderCredits)})`, false, BRAND.primary);
    }
    summaryRow("Total Payments Received", `(${formatCurrency(invoice.totalPayments)})`, false, BRAND.primary);
    if (invoice.totalAdjustments !== 0) {
      summaryRow("Adjustments", formatCurrency(invoice.totalAdjustments));
    }
    y += 2;
    doc.moveTo(L + 10, y).lineTo(L + W, y).strokeColor(BRAND.border).lineWidth(0.5).stroke();
    y += 6;
    summaryRow(
      "Net Amount Due",
      formatCurrency(invoice.netAmountDue),
      true,
      invoice.netAmountDue <= 0 ? BRAND.primary : BRAND.danger
    );

    if (invoice.netAmountDue <= 0) {
      y += 4;
      doc.rect(L, y, W, 22).fill("#dcfce7");
      doc.fillColor(BRAND.primary).font("Helvetica-Bold").fontSize(9)
        .text("✓ This account is fully settled. Thank you!", L + 6, y + 7, { width: W - 12, align: "center" });
      y += 30;
    }

    // ── Detailed Breakdown ────────────────────────────────────────────────
    if (detailed && invoice.lineItems && invoice.lineItems.length > 0) {
      y += 10;
      doc.moveTo(L, y).lineTo(L + W, y).strokeColor(BRAND.border).lineWidth(1).stroke();
      y += 12;

      doc.fillColor(BRAND.text).fontSize(10).font("Helvetica-Bold")
        .text("Detailed Transaction Log", L, y);
      y += 14;

      const dCols = [
        { label: "Date", x: L, w: 70 },
        { label: "Description", x: L + 70, w: 180 },
        { label: "Category", x: L + 250, w: 80 },
        { label: "Qty", x: L + 330, w: 45, align: "right" },
        { label: "Amount", x: L + 375, w: 75, align: "right" },
        { label: "Type", x: L + 450, w: 45, align: "right" },
      ];

      doc.rect(L, y, W, 18).fill(BRAND.light);
      dCols.forEach((col) => {
        doc.fillColor(BRAND.muted).fontSize(7.5).font("Helvetica-Bold")
          .text(col.label, col.x + 2, y + 5, { width: col.w - 4, align: col.align || "left" });
      });
      y += 18;

      invoice.lineItems.forEach((item, i) => {
        // Page break check
        if (y > doc.page.height - 100) {
          doc.addPage();
          y = 40;
        }

        if (i % 2 === 1) doc.rect(L, y, W, 18).fill("#fafafa");
        doc.fillColor(BRAND.text).fontSize(7.5).font("Helvetica")
          .text(formatDate(item.date), dCols[0].x + 2, y + 5, { width: dCols[0].w - 4 })
          .text(item.description || "—", dCols[1].x + 2, y + 5, { width: dCols[1].w - 4 })
          .text(item.category || "—", dCols[2].x + 2, y + 5, { width: dCols[2].w - 4 })
          .text(item.quantity != null ? String(item.quantity) : "—", dCols[3].x, y + 5, { width: dCols[3].w - 4, align: "right" });
        doc.fillColor(item.entryType === "credit" ? BRAND.primary : BRAND.text)
          .text(formatCurrency(item.amount), dCols[4].x, y + 5, { width: dCols[4].w - 4, align: "right" });
        doc.fillColor(item.entryType === "credit" ? BRAND.primary : BRAND.danger).fontSize(7)
          .text(item.entryType === "credit" ? "CR" : "DR", dCols[5].x, y + 5, { width: dCols[5].w - 4, align: "right" });
        doc.moveTo(L, y + 18).lineTo(L + W, y + 18).strokeColor(BRAND.border).lineWidth(0.5).stroke();
        y += 18;
      });
    }

    // ── Footer ───────────────────────────────────────────────────────────
    const footerY = doc.page.height - 50;
    doc.rect(0, footerY, doc.page.width, 50).fill(BRAND.light);
    doc.fillColor(BRAND.muted).fontSize(8).font("Helvetica")
      .text(`${BRAND.name} | ${BRAND.email} | ${BRAND.phone}`, L, footerY + 10, { width: W, align: "center" })
      .text("Thank you for choosing Farmilky!", L, footerY + 24, { width: W, align: "center" });

    doc.end();
  });
}
