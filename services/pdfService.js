/**
 * PDF Invoice Generator — Farmilky
 * Mirrors farmilky-management InvoiceDetailPage + invoices.css as closely as possible.
 *   Header → Info boxes → Invoice Summary → Product Summary
 *   → Transaction Ledger (detailed only) → Notes → Payment Options
 */
import PDFDocument from "pdfkit";
import QRCode from "qrcode";

// ── Brand config ──────────────────────────────────────────────────────────────
const BRAND = {
  name:    "FARMILKY",
  sub:     "Fresh & Pure Milk Delivered Daily",
  tagline: "Aapka bharosa, hamari zimmedari.",
  phone:   process.env.BRAND_PHONE || "9244237975",
  upiId:   process.env.UPI_ID  || "",
  upiName: process.env.UPI_NAME || "Farmilky",
};

// ── Color palette — matches portal invoices.css ───────────────────────────────
const C = {
  greenDark:    "#1a4731",
  green:        "#2d6a4f",
  greenLight:   "#f0faf4",
  greenBorder:  "#9ecfb4",
  greenText:    "#7dbf9a",
  greenSubtle:  "#b2d8c4",
  red:          "#991b1b",
  text:         "#0f172a",
  muted:        "#64748b",
  border:       "#e2e8f0",
  borderMid:    "#cbd5e1",
  white:        "#ffffff",
  rowAlt:       "#f8fafc",
  bgAlt:        "#f1f5f9",
  surfaceMuted: "#f1f5f9",
};

// ── Status labels & badge colors ─────────────────────────────────────────────
const STATUS_LABELS = {
  draft:          "DRAFT",
  sent:           "SENT",
  paid:           "PAID",
  partially_paid: "PARTIAL",
  overdue:        "OVERDUE",
  cancelled:      "CANCELLED",
  void:           "VOID",
};
const STATUS_BG = {
  draft:          "#64748b",
  sent:           "#2563eb",
  paid:           "#059669",
  partially_paid: "#d97706",
  overdue:        "#dc2626",
  cancelled:      "#94a3b8",
  void:           "#94a3b8",
};

// ── Number & date helpers ─────────────────────────────────────────────────────
// Helvetica (built-in) lacks ₹ (U+20B9). Use "Rs." as print-safe fallback.
const fmtNum = (n) =>
  Math.abs(n ?? 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
const fmt  = (n) => `Rs.${fmtNum(n)}`;
const fmtC = (n) => `(Rs.${fmtNum(n)})`; // accounting notation for credits

function fmtDate(d) {
  if (!d) return "--";
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? "--"
    : dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function monthLabel(month, year) {
  return new Date(year, month - 1, 1)
    .toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

// ── Drawing primitives ────────────────────────────────────────────────────────
function rule(doc, x, y, w, color = C.border, lw = 0.5) {
  doc.save()
    .moveTo(x, y).lineTo(x + w, y)
    .strokeColor(color).lineWidth(lw).stroke()
    .restore();
}

/**
 * Full-width green section title bar — mirrors .inv-doc-section-title
 * Portal: padding 5px + font 10px + 5px → ~22px total height.
 */
function titleBar(doc, M, W, y, label) {
  const H = 22;
  doc.save().roundedRect(M, y, W, H, 1.5).fill(C.green).restore();
  doc.fillColor(C.white).font("Helvetica-Bold").fontSize(7.6)
    .text(label, M + 9, y + 6.8, { width: W - 18, lineBreak: false });
  return y + H;
}

/** Measure wrapped text height for a given font / size / width. */
function measureHeight(doc, text, width, fontName = "Helvetica", fontSize = 7.5) {
  if (!text) return fontSize + 2;
  doc.font(fontName).fontSize(fontSize);
  return doc.heightOfString(String(text), { width });
}

/**
 * Render a label : value row — mirrors .inv-info-row.
 * Returns the vertical space consumed (including inter-row gap).
 */
function drawKV(doc, x, y, totalW, label, value, {
  bold = false, labelW = 90, fontSize = 7.8,
} = {}) {
  const gap    = 6;
  const valW   = totalW - labelW - gap;
  const valStr = String(value ?? "--");
  const fName  = bold ? "Helvetica-Bold" : "Helvetica";
  const hVal   = measureHeight(doc, valStr, valW, fName, fontSize);
  const rowH   = Math.max(hVal, fontSize + 2);

  doc.fillColor(C.muted).font("Helvetica").fontSize(fontSize)
    .text(label + ":", x, y + 1, { width: labelW, lineBreak: false });
  doc.fillColor(C.text).font(fName).fontSize(fontSize)
    .text(valStr, x + labelW + gap, y + 1, { width: valW });

  return rowH + 6; // 6pt inter-row gap ≈ portal space-2
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function generateInvoicePDF(invoice, {
  detailed  = false,
  upiId     = BRAND.upiId,
  upiName   = BRAND.upiName,
  phone     = BRAND.phone,
} = {}) {
  const effectiveUpiId   = (upiId   || "").trim();
  const effectiveUpiName = (upiName || BRAND.upiName).trim();
  const effectivePhone   = (phone   || BRAND.phone).trim();

  // Build UPI deep-link if amount is due and UPI ID is configured.
  // upiUri  → used for QR code (upi:// scheme, scanned by camera/UPI app).
  // tapLink → https:// redirect via backend /pay/upi so that PDF tap button
  //           opens in the mobile browser which then bounces to upi://.
  //           (PDF viewers block custom URI schemes; https:// always works.)
  let upiUri  = null;
  let tapLink = null;
  if (effectiveUpiId && (invoice.netAmountDue ?? 0) > 0) {
    const upiParams = new URLSearchParams({
      pa: effectiveUpiId,
      pn: effectiveUpiName,
      am: Number(invoice.netAmountDue).toFixed(2),
      cu: "INR",
      tn: `Farmilky Invoice ${invoice.invoiceNumber}`,
    });
    upiUri = `upi://pay?${upiParams.toString()}`;

    const backendUrl = (process.env.BACKEND_URL || "").replace(/\/$/, "");
    if (backendUrl) {
      tapLink = `${backendUrl}/pay/upi?${upiParams.toString()}`;
    }
  }

  // Generate QR PNG buffer
  let qrBuffer = null;
  if (upiUri) {
    try {
      qrBuffer = await QRCode.toBuffer(upiUri, {
        type: "png", width: 200, margin: 1,
        color: { dark: "#1a4731", light: "#ffffff" },
      });
    } catch (_) { qrBuffer = null; }
  }

  return new Promise((resolve, reject) => {
    const M   = 30;                          // page margin
    const doc = new PDFDocument({
      margin: M, size: "A4",
      autoFirstPage: true,
      info: {
        Title:   `Invoice ${invoice.invoiceNumber}`,
        Author:  "Farmilky",
        Subject: `Billing period ${invoice.billingPeriod?.month}/${invoice.billingPeriod?.year}`,
      },
    });

    const PW = doc.page.width;   // 595.28 pt
    const PH = doc.page.height;  // 841.89 pt
    const W  = PW - M * 2;       // 535.28 pt usable width

    const chunks = [];
    doc.on("data",  (c) => chunks.push(c));
    doc.on("end",   ()  => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // ── Page geometry ──────────────────────────────────────────────────────
    // Content must stay above SAFE_BOTTOM (bottom margin + breathing room).
    const SAFE_BOTTOM = PH - M - 16;            // ~795.89

    let y = 0; // current vertical cursor

    function newPage() {
      doc.addPage();
      y = M;
    }

    function addPageIfNeeded(needed) {
      if (y + needed > SAFE_BOTTOM) { newPage(); return true; }
      return false;
    }

    // ── S1: Header band ─────────────────────────────────────────────────────
    // Mirrors .inv-doc-header: background #1a4731, padding space-5 space-6
    const HDR_H = 76;
    doc.save().rect(0, 0, PW, HDR_H).fill(C.greenDark).restore();

    // Brand (left) — .inv-doc-brand-name 1.8rem + brand-sub + brand-tagline
    doc.fillColor(C.white).font("Helvetica-Bold").fontSize(24)
      .text(BRAND.name, M, 13, { width: W * 0.52, lineBreak: false });
    doc.fillColor(C.greenText).font("Helvetica").fontSize(7.6)
      .text(BRAND.sub, M, 43, { width: W * 0.55, lineBreak: false });
    doc.fillColor(C.greenSubtle).font("Helvetica-Oblique").fontSize(7.2)
      .text(BRAND.tagline, M, 54.5, { width: W * 0.55, lineBreak: false });

    // Invoice meta (right) — .inv-doc-meta align: flex-end
    const RX = M + W * 0.58;
    const RW = W * 0.42;
    doc.fillColor(C.white).font("Helvetica-Bold").fontSize(13)
      .text("INVOICE", RX, 13, { width: RW, align: "right", lineBreak: false });
    doc.fillColor(C.greenText).font("Helvetica").fontSize(7.6)
      .text(invoice.invoiceNumber, RX, 34, { width: RW, align: "right", lineBreak: false });

    // Status badge
    const sk = invoice.status || "draft";
    const sW = 72, sH = 16;
    const sX = M + W - sW, sY = 52;
    doc.save().roundedRect(sX, sY, sW, sH, 3).fill(STATUS_BG[sk] || C.green).restore();
    doc.fillColor(C.white).font("Helvetica-Bold").fontSize(6.8)
      .text(STATUS_LABELS[sk] || sk.toUpperCase(), sX, sY + 4.8,
        { width: sW, align: "center", lineBreak: false });

    y = HDR_H + 10;

    // ── S2: Customer Details | Invoice Meta ──────────────────────────────────
    // Left box: green header + customer rows.
    // Right box: no header bar; content starts at same Y as left body.
    // CSS: .inv-info-box--meta padding-top: calc(28px + var(--space-3)) ≈ 40px
    const customer = invoice.userId || {};

    const custRows = [
      ["Customer Name", customer.name  || "--", true ],
      ["Mobile No.",    customer.phone || "--", false],
      ...(customer.email ? [["Email", customer.email, false]] : []),
    ];
    const metaRows = [
      ["Bill No.",       invoice.invoiceNumber, true],
      ["Billing Period", monthLabel(invoice.billingPeriod.month, invoice.billingPeriod.year), false],
      ["Bill Date",      fmtDate(invoice.createdAt), false],
      ...(invoice.sentAt         ? [["Sent On",  fmtDate(invoice.sentAt),  false]] : []),
      ...(invoice.paidAt         ? [["Paid On",  fmtDate(invoice.paidAt),  false]] : []),
      ...(invoice.isEarlyBilling ? [["Type",     "Early Billing",          false]] : []),
    ];

    const BOX_HDR_H = 24;  // green header bar height ≈ portal .inv-info-box-header ~26px
    const BOX_PAD_X = 10;
    const BOX_PAD_T = 12;  // portal space-3 body top padding
    const BOX_PAD_B = 12;
    const BOX_GAP   = 10;
    const COL_W     = (W - BOX_GAP) / 2;
    const LX        = M;
    const RX2       = M + COL_W + BOX_GAP;
    const innerW    = COL_W - BOX_PAD_X * 2;

    // Sum row heights for a column (no trailing inter-row gap)
    function sumRowsH(rows) {
      let h = 0;
      rows.forEach(([, val, bld]) => {
        const vW  = innerW - 90 - 6;
        const fNm = bld ? "Helvetica-Bold" : "Helvetica";
        h += Math.max(measureHeight(doc, String(val ?? "--"), vW, fNm, 7.8), 9.8) + 6;
      });
      return h; // last +6 becomes box bottom padding inside BOX_PAD_B
    }

    const leftH  = BOX_HDR_H + BOX_PAD_T + sumRowsH(custRows) + BOX_PAD_B;
    const rightH = BOX_HDR_H + BOX_PAD_T + sumRowsH(metaRows) + BOX_PAD_B;
    const INFO_H = Math.max(leftH, rightH, 104);

    addPageIfNeeded(INFO_H + 8);

    // Left box
    doc.save().roundedRect(LX, y, COL_W, INFO_H, 3)
      .strokeColor(C.border).lineWidth(0.6).stroke().restore();
    doc.save()
      .roundedRect(LX, y, COL_W, BOX_HDR_H, 3).fill(C.green);
    doc.rect(LX, y + BOX_HDR_H - 3, COL_W, 3).fill(C.green);
    doc.restore();
    rule(doc, LX, y + BOX_HDR_H, COL_W, C.greenBorder, 0.5);
    doc.fillColor(C.white).font("Helvetica-Bold").fontSize(7.2)
      .text("CUSTOMER DETAILS", LX + 7, y + 7.8, { width: COL_W - 14, lineBreak: false });

    let liy = y + BOX_HDR_H + BOX_PAD_T;
    custRows.forEach(([lbl, val, bld]) => {
      liy += drawKV(doc, LX + BOX_PAD_X, liy, innerW, lbl, val,
        { bold: bld, labelW: 90, fontSize: 7.8 });
    });

    // Right box (no header bar)
    doc.save().roundedRect(RX2, y, COL_W, INFO_H, 3)
      .strokeColor(C.border).lineWidth(0.6).stroke().restore();

    let riy = y + BOX_HDR_H + BOX_PAD_T;
    metaRows.forEach(([lbl, val, bld]) => {
      riy += drawKV(doc, RX2 + BOX_PAD_X, riy, innerW, lbl, val,
        { bold: bld, labelW: 90, fontSize: 7.8 });
    });

    y += INFO_H + 10;
    rule(doc, M, y - 1, W, C.border, 0.4); // section separator

    // ── S3: Invoice Summary ──────────────────────────────────────────────────
    // Mirrors .inv-doc-section > .inv-summary-ledger { justify-content: space-between }
    addPageIfNeeded(110);
    y = titleBar(doc, M, W, y, "INVOICE SUMMARY");
    y += 10;

    const SUM_LX       = M + 12;
    const SUM_LW       = W * 0.52;           // max label width
    // Value right-aligned; start far enough right to avoid any label/value collision
    const SUM_VW       = W * 0.35;
    const SUM_VX_START = M + W - 12 - SUM_VW; // = ~349pt from left edge

    function drawSummaryRow(label, value, { color = C.text, bold = false } = {}) {
      addPageIfNeeded(16);
      const sz  = bold ? 8.8 : 8;
      const fNm = bold ? "Helvetica-Bold" : "Helvetica";
      doc.fillColor(C.muted).font("Helvetica").fontSize(8)
        .text(label, SUM_LX, y, { width: SUM_LW, lineBreak: false });
      doc.fillColor(color).font(fNm).fontSize(sz)
        .text(value, SUM_VX_START, y, { width: SUM_VW, align: "right", lineBreak: false });
      y += sz + 5;
    }

    if ((invoice.previousBalance ?? 0) !== 0) {
      drawSummaryRow(
        "Previous Balance B/F",
        invoice.previousBalance > 0
          ? fmt(invoice.previousBalance)
          : fmtC(Math.abs(invoice.previousBalance)),
        { color: invoice.previousBalance > 0 ? C.red : C.green, bold: true },
      );
    }
    drawSummaryRow("Total Charges", fmt(invoice.totalCharges));
    if ((invoice.orderCredits ?? 0) > 0) {
      drawSummaryRow("Order Credits", fmtC(invoice.orderCredits), { color: C.green });
    }
    drawSummaryRow("Payments Received", fmtC(invoice.totalPayments), { color: C.green });
    if ((invoice.totalAdjustments ?? 0) !== 0) {
      drawSummaryRow(
        "Adjustments",
        invoice.totalAdjustments < 0
          ? fmtC(Math.abs(invoice.totalAdjustments))
          : fmt(invoice.totalAdjustments),
        { color: invoice.totalAdjustments < 0 ? C.green : C.text },
      );
    }

    // Divider before net total — mirrors .inv-ledger-total { border-top: 2px }
    y += 3;
    rule(doc, SUM_LX, y, W - 24, C.borderMid, 0.9);
    y += 8;

    addPageIfNeeded(22);
    const netDue   = invoice.netAmountDue ?? 0;
    const netColor = netDue <= 0 ? C.green : C.red;
    const netValue = netDue < 0
      ? fmtC(Math.abs(netDue))  // credit balance → parenthetical
      : fmt(netDue);             // zero or positive

    // Label — .inv-ledger-total extrabold
    doc.fillColor(C.text).font("Helvetica-Bold").fontSize(9)
      .text("Net Amount Due", SUM_LX, y, { width: SUM_LW, lineBreak: false });
    // Value — portal .inv-ledger-total span:last-child { font-size: xl }
    doc.fillColor(netColor).font("Helvetica-Bold").fontSize(11.5)
      .text(netValue, SUM_VX_START, y - 1.5, { width: SUM_VW, align: "right", lineBreak: false });
    y += 16;

    if (netDue <= 0) {
      addPageIfNeeded(13);
      doc.fillColor(C.green).font("Helvetica-Bold").fontSize(7.2)
        .text("Account fully settled — thank you!", SUM_LX, y, { width: W - 24, lineBreak: false });
      y += 12;
    }

    y += 8;
    rule(doc, M, y - 1, W, C.border, 0.4); // section separator

    // ── S4: Product / Milk Summary ───────────────────────────────────────────
    // Mirrors .inv-product-table — thead green, tfoot greenLight
    if (invoice.productSummary?.length > 0) {
      const estNeeded = 22 + 18 + invoice.productSummary.length * 22 + 24;
      if (y + Math.min(estNeeded, 130) > SAFE_BOTTOM) newPage();

      y = titleBar(doc, M, W, y, "PRODUCT / MILK SUMMARY");

      // Column definitions — total width = W = 535.28
      const pCols = [
        { label: "#",           x: M,        w: 22,       align: "left"  },
        { label: "PRODUCT",     x: M + 22,   w: 136,      align: "left"  },
        { label: "TOTAL QTY",   x: M + 158,  w: 58,       align: "right" },
        { label: "RATE",        x: M + 216,  w: 68,       align: "right" },
        { label: "AMOUNT",      x: M + 284,  w: 74,       align: "right" },
        { label: "PAID",        x: M + 358,  w: 68,       align: "right" },
        { label: "OUTSTANDING", x: M + 426,  w: W - 426,  align: "right" },
      ];

      // Draw the green column-header row (repeatable on page breaks)
      const drawProdHeader = (yy) => {
        doc.save().rect(M, yy, W, 19).fill(C.green).restore();
        pCols.forEach(col => {
          doc.fillColor(C.white).font("Helvetica-Bold").fontSize(6.4)
            .text(col.label, col.x + 2, yy + 6,
              { width: col.w - 4, align: col.align, lineBreak: false });
        });
        return yy + 19;
      };

      y = drawProdHeader(y);

      let totAmt = 0, totPaid = 0, totOut = 0;

      const drawProdTotals = (yy) => {
        const H = 22;
        doc.save().rect(M, yy, W, H).fill(C.greenLight).restore();
        rule(doc, M, yy, W, C.greenBorder, 1.2);
        const ty = yy + 7;
        doc.fillColor(C.text).font("Helvetica-Bold").fontSize(7.8)
          .text("TOTAL", pCols[1].x + 2, ty, { width: 80, lineBreak: false });
        doc.fillColor(C.text).font("Helvetica-Bold").fontSize(7.8)
          .text(fmt(totAmt),  pCols[4].x, ty, { width: pCols[4].w - 4, align: "right", lineBreak: false });
        doc.fillColor(C.green).font("Helvetica-Bold").fontSize(7.8)
          .text(fmt(totPaid), pCols[5].x, ty, { width: pCols[5].w - 4, align: "right", lineBreak: false });
        doc.fillColor(totOut > 0 ? C.red : C.green).font("Helvetica-Bold").fontSize(7.8)
          .text(fmt(totOut),  pCols[6].x, ty, { width: pCols[6].w - 4, align: "right", lineBreak: false });
        return yy + H;
      };

      for (let idx = 0; idx < invoice.productSummary.length; idx++) {
        const p = invoice.productSummary[idx];
        const label  = p.productName + (p.variantLabel ? ` (${p.variantLabel})` : "");
        const nameW  = pCols[1].w - 4;
        const nameH  = measureHeight(doc, label, nameW, "Helvetica", 7.6);
        const bdLines = (p.rateBreakdown?.length > 1) ? p.rateBreakdown.length : 0;
        const bdH    = bdLines > 0 ? bdLines * 7.5 + 4 : 0;
        const RH     = Math.max(22, nameH + bdH + 10);

        // Reserve totals row height on last product
        const reserve = (idx === invoice.productSummary.length - 1) ? 22 + 4 : 0;
        if (y + RH + reserve > SAFE_BOTTOM) {
          newPage();
          y = drawProdHeader(y);
        }

        if (idx % 2 === 1) doc.save().rect(M, y, W, RH).fill(C.rowAlt).restore();

        const cyName = y + 6;
        doc.fillColor(C.text).font("Helvetica-Bold").fontSize(7.6)
          .text(String(idx + 1), pCols[0].x + 2, cyName, { width: pCols[0].w - 4, lineBreak: false });
        doc.fillColor(C.text).font("Helvetica").fontSize(7.6)
          .text(label, pCols[1].x + 2, cyName, { width: nameW });

        if (bdLines > 0) {
          let bY = cyName + nameH + 2;
          p.rateBreakdown.forEach(rb => {
            doc.fillColor(C.muted).font("Helvetica").fontSize(6.2)
              .text(`Rs.${rb.rate}/${p.unit || ""} x ${rb.quantity} = ${fmt(rb.amount)}`,
                pCols[1].x + 2, bY, { width: nameW, lineBreak: false });
            bY += 7.5;
          });
        }

        // Numeric columns — vertically centered in row height
        const midY = y + RH / 2 - 4;
        doc.fillColor(C.muted).font("Helvetica").fontSize(7.6)
          .text(`${p.totalQuantity} ${p.unit || ""}`,
            pCols[2].x, midY, { width: pCols[2].w - 4, align: "right", lineBreak: false })
          .text(`Rs.${(p.avgRate ?? 0).toFixed(2)}/${p.unit || ""}`,
            pCols[3].x, midY, { width: pCols[3].w - 4, align: "right", lineBreak: false });
        doc.fillColor(C.text).font("Helvetica-Bold").fontSize(7.6)
          .text(fmt(p.totalAmount),
            pCols[4].x, midY, { width: pCols[4].w - 4, align: "right", lineBreak: false });
        doc.fillColor(C.green).font("Helvetica").fontSize(7.6)
          .text(fmt(p.paidAmount),
            pCols[5].x, midY, { width: pCols[5].w - 4, align: "right", lineBreak: false });
        doc.fillColor(p.outstandingAmount > 0 ? C.red : C.green).font("Helvetica-Bold").fontSize(7.6)
          .text(fmt(p.outstandingAmount),
            pCols[6].x, midY, { width: pCols[6].w - 4, align: "right", lineBreak: false });

        totAmt  += p.totalAmount      ?? 0;
        totPaid += p.paidAmount       ?? 0;
        totOut  += p.outstandingAmount ?? 0;

        rule(doc, M, y + RH, W, C.border, 0.25);
        y += RH;
      }

      if (y + 22 > SAFE_BOTTOM) newPage();
      y = drawProdTotals(y);
      y += 10;
      rule(doc, M, y - 1, W, C.border, 0.4);
    }

    // ── S5: Detailed Transaction Ledger ──────────────────────────────────────
    // Mirrors .ledger-table — grey sub-header, alternating rows, CR/DR badges
    if (detailed && invoice.lineItems?.length > 0) {
      const dCols = [
        { label: "DATE",        x: M,        w: 60,        align: "left"  },
        { label: "DESCRIPTION", x: M + 60,   w: 160,       align: "left"  },
        { label: "CATEGORY",    x: M + 220,  w: 76,        align: "left"  },
        { label: "QTY",         x: M + 296,  w: 42,        align: "right" },
        { label: "AMOUNT",      x: M + 338,  w: 72,        align: "right" },
        { label: "TYPE",        x: M + 410,  w: W - 410,   align: "right" },
      ];

      const drawLedgerSubHeader = (yy) => {
        doc.save().rect(M, yy, W, 18).fill(C.bgAlt).restore();
        rule(doc, M, yy, W, C.borderMid, 0.5);
        dCols.forEach(col => {
          doc.fillColor(C.muted).font("Helvetica-Bold").fontSize(6.4)
            .text(col.label, col.x + 3, yy + 5.5,
              { width: col.w - 6, align: col.align, lineBreak: false });
        });
        return yy + 18;
      };

      // Title bar + sub-header (title only on first occurrence)
      if (y + 22 + 18 + 20 > SAFE_BOTTOM) newPage();
      y = titleBar(doc, M, W, y,
        `TRANSACTION LOG  (${invoice.lineItems.length} entries)`);
      y = drawLedgerSubHeader(y);

      for (let i = 0; i < invoice.lineItems.length; i++) {
        const item = invoice.lineItems[i];

        // Combine description + product name byline (mirrors ledger-ref + ledger-by)
        let desc = item.description || "--";
        if (item.productName && !desc.includes(item.productName)) {
          const suffix = item.variantLabel
            ? `${item.productName} (${item.variantLabel})`
            : item.productName;
          desc += ` — ${suffix}`;
        }

        const descW = dCols[1].w - 6;
        const catW  = dCols[2].w - 6;
        const RH    = Math.max(20, Math.max(
          measureHeight(doc, desc, descW, "Helvetica", 7.2),
          measureHeight(doc, item.category || "--", catW, "Helvetica", 7.2),
        ) + 8);

        if (y + RH > SAFE_BOTTOM) {
          newPage();
          y = drawLedgerSubHeader(y); // repeat column headers on continuation
        }

        if (i % 2 === 1) doc.save().rect(M, y, W, RH).fill(C.rowAlt).restore();
        rule(doc, M, y, W, C.border, 0.25);

        const cy = y + 5;
        doc.fillColor(C.text).font("Helvetica").fontSize(7.2)
          .text(fmtDate(item.date), dCols[0].x + 3, cy,
            { width: dCols[0].w - 6, lineBreak: false })
          .text(desc, dCols[1].x + 3, cy, { width: descW })
          .text(item.category || "--", dCols[2].x + 3, cy, { width: catW, lineBreak: false });

        doc.fillColor(C.muted).font("Helvetica").fontSize(7.2)
          .text(item.quantity != null ? String(item.quantity) : "--",
            dCols[3].x, cy, { width: dCols[3].w - 3, align: "right", lineBreak: false });

        const isCr = item.entryType === "credit";
        doc.fillColor(isCr ? C.green : C.text).font("Helvetica").fontSize(7.2)
          .text(fmt(item.amount), dCols[4].x, cy,
            { width: dCols[4].w - 3, align: "right", lineBreak: false });

        // CR / DR badge — mirrors .inv-entry-badge .inv-entry-cr/.inv-entry-dr
        const bW = 22, bH = 12;
        const bX = dCols[5].x + dCols[5].w - bW - 4;
        const bY = y + RH / 2 - bH / 2;
        doc.save().roundedRect(bX, bY, bW, bH, 2)
          .fill(isCr ? "#d1fae5" : "#fee2e2").restore();
        doc.fillColor(isCr ? "#065f46" : "#991b1b").font("Helvetica-Bold").fontSize(6.4)
          .text(isCr ? "CR" : "DR", bX, bY + 2.5,
            { width: bW, align: "center", lineBreak: false });

        y += RH;
      }

      rule(doc, M, y, W, C.border, 0.25); // bottom border of last row
      y += 10;
      rule(doc, M, y - 1, W, C.border, 0.4);
    }

    // ── S6: Notes ────────────────────────────────────────────────────────────
    // Mirrors .inv-doc-notes: italic, muted — no "Note:" prefix
    if (invoice.notes) {
      const noteTxt = String(invoice.notes);
      const noteH   = measureHeight(doc, noteTxt, W - 24, "Helvetica-Oblique", 7.4);
      addPageIfNeeded(noteH + 18);
      y += 4;
      doc.fillColor(C.muted).font("Helvetica-Oblique").fontSize(7.4)
        .text(noteTxt, M + 12, y, { width: W - 24 });
      y += noteH + 10;
      rule(doc, M, y - 1, W, C.border, 0.4);
    }

    // ── S7: Payment Options ──────────────────────────────────────────────────
    // Two layouts:
    //  A) Has UPI  → 3-column grid: [QR (optional)] [UPI info] [Contact]
    //  B) Phone-only → centred contact card (no UPI columns at all)
    //
    // Column geometry for layout A (when QR is present):
    //   Col 1 QR:      QR_IMG + 2×QR_PAD = 108 + 8 = 116pt
    //   Gap 1:         14pt
    //   Col 2 UPI:     W - 116 - 14 - 130 - 12 = 263pt
    //   Gap 2:         12pt
    //   Col 3 Contact: 130pt
    //   Total:         535pt = W ✓

    const QR_IMG   = 108;                          // QR image square size
    const QR_PAD   =   4;                          // white-space inset inside border
    const QR_BOX   = qrBuffer ? QR_IMG + QR_PAD * 2 : 0; // outer box size (116 or 0)
    const PAY_GAP1 = qrBuffer ? 14 : 0;            // gap after QR column
    const CONT_W   = 130;                          // contact column width
    const PAY_GAP2 = 12;                           // gap before contact column
    const MID_L    = M + QR_BOX + PAY_GAP1;        // UPI column left edge
    const MID_W    = W - QR_BOX - PAY_GAP1 - CONT_W - PAY_GAP2; // UPI column width
    const CONT_L   = M + W - CONT_W;               // contact column left edge

    // Reserve enough height before page-breaking
    const payBodyH = effectiveUpiId
      ? (qrBuffer ? Math.max(QR_BOX + 28, 115) : 100)
      : 70;  // phone-only card
    if (y + 22 + 10 + payBodyH + 14 > SAFE_BOTTOM) newPage();

    y = titleBar(doc, M, W, y, "PAYMENT OPTIONS");
    y += 10;

    const payTopY = y; // vertical anchor shared by all columns

    if (effectiveUpiId) {
      // ── Layout A: 3-column UPI layout ──────────────────────────────────────

      // Col 1: QR code (only when amount > 0)
      if (qrBuffer) {
        // Bordered box — mirrors .inv-payment-qr-link border
        doc.save()
          .roundedRect(M, payTopY, QR_BOX, QR_BOX, 4)
          .strokeColor(C.greenBorder).lineWidth(1.2).stroke()
          .restore();
        doc.image(qrBuffer, M + QR_PAD, payTopY + QR_PAD, {
          width: QR_IMG, height: QR_IMG, link: upiUri,
        });
        // "SCAN & PAY" — mirrors .inv-payment-qr-label
        doc.fillColor(C.muted).font("Helvetica-Bold").fontSize(6.6)
          .text("SCAN & PAY", M, payTopY + QR_BOX + 6,
            { width: QR_BOX, align: "center", lineBreak: false });
        // Amount — mirrors .inv-payment-qr-amount
        doc.fillColor(C.green).font("Helvetica-Bold").fontSize(8.6)
          .text(fmt(invoice.netAmountDue), M, payTopY + QR_BOX + 17,
            { width: QR_BOX, align: "center", lineBreak: false });
      }

      // Col 2: UPI info — mirrors .inv-payment-info
      let midY = payTopY;

      // Heading
      doc.fillColor(C.text).font("Helvetica-Bold").fontSize(7.8)
        .text("Pay via UPI, Google Pay, PhonePe, or Paytm",
          MID_L, midY, { width: MID_W, lineBreak: false });
      midY += 15;

      // UPI ID pill — mirrors .inv-payment-upi
      // [  UPI ID  |  6261348326@slc               ]
      const pillH = 28;
      const pillW = MID_W;
      const upiLblW = 38;                    // "UPI ID" label column
      const upiSepX = MID_L + upiLblW + 8;  // vertical separator X
      const upiValX = upiSepX + 8;          // UPI value column start
      const upiValW = (MID_L + pillW) - upiValX - 8; // available value width

      doc.save().roundedRect(MID_L, midY, pillW, pillH, 4)
        .fill(C.surfaceMuted).restore();
      doc.save().roundedRect(MID_L, midY, pillW, pillH, 4)
        .strokeColor(C.greenBorder).lineWidth(0.7).stroke().restore();

      // "UPI ID" label
      doc.fillColor(C.muted).font("Helvetica-Bold").fontSize(6.6)
        .text("UPI ID", MID_L + 8, midY + 9, { width: upiLblW, lineBreak: false });

      // Vertical divider inside pill
      doc.save()
        .moveTo(upiSepX, midY + 5).lineTo(upiSepX, midY + pillH - 5)
        .strokeColor(C.greenBorder).lineWidth(0.5).stroke()
        .restore();

      // UPI value (right side of pill)
      doc.fillColor(C.green).font("Helvetica-Bold").fontSize(8.4)
        .text(effectiveUpiId, upiValX, midY + 8.5,
          { width: upiValW, lineBreak: false });
      midY += pillH + 9;

      // Tap-to-pay button — links to https:// backend redirect → upi://
      // Works in all mobile PDF viewers because https:// opens in browser,
      // which then bounces to upi:// and launches the UPI app chooser.
      if (tapLink) {
        // Large filled button — sized for finger tapping on mobile
        const tapW = MID_W;   // full column width
        const tapH = 28;
        const tapR = 6;
        // Shadow illusion: slightly darker rect behind
        doc.save().roundedRect(MID_L + 1, midY + 2, tapW, tapH, tapR)
          .fill("#0f2e1e").restore();
        // Main button fill
        doc.save().roundedRect(MID_L, midY, tapW, tapH, tapR)
          .fill(C.green).restore();
        // Label
        doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(9)
          .text("Pay via UPI  \u2192", MID_L, midY + 9.5,
            { width: tapW, align: "center", lineBreak: false });
        // Link annotation covers the entire button area
        doc.link(MID_L, midY, tapW, tapH, tapLink);
        midY += tapH + 10;
      }

      // Confirmation note
      const payNote = "After payment, share a screenshot as confirmation. Dhanyavaad!";
      doc.fillColor(C.muted).font("Helvetica-Oblique").fontSize(7)
        .text(payNote, MID_L, midY, { width: MID_W });
      midY += measureHeight(doc, payNote, MID_W, "Helvetica-Oblique", 7) + 4;

      // Col 3: Contact — mirrors .inv-payment-contact
      if (effectivePhone) {
        let contY = payTopY;
        const cardH = 22;
        const cardR = 3;

        // "CONTACT" heading
        doc.fillColor(C.muted).font("Helvetica-Bold").fontSize(6.8)
          .text("CONTACT", CONT_L, contY, { width: CONT_W, lineBreak: false });
        contY += 13;

        // Helper: draw a labelled contact card (Ph / WA)
        const drawContactCard = (lbl, yy) => {
          doc.save().roundedRect(CONT_L, yy, CONT_W, cardH, cardR)
            .fill(C.surfaceMuted).restore();
          doc.save().roundedRect(CONT_L, yy, CONT_W, cardH, cardR)
            .strokeColor(C.border).lineWidth(0.5).stroke().restore();
          doc.fillColor(C.muted).font("Helvetica-Bold").fontSize(6.6)
            .text(lbl, CONT_L + 7, yy + 7.5, { width: 16, lineBreak: false });
          doc.save()
            .moveTo(CONT_L + 24, yy + 5).lineTo(CONT_L + 24, yy + cardH - 5)
            .strokeColor(C.border).lineWidth(0.5).stroke().restore();
          doc.fillColor(C.text).font("Helvetica-Bold").fontSize(7.6)
            .text(effectivePhone, CONT_L + 29, yy + 7,
              { width: CONT_W - 32, lineBreak: false });
        };

        drawContactCard("Ph", contY); contY += cardH + 5;
        drawContactCard("WA", contY);
      }

      // Advance y past tallest column
      const qrColH = qrBuffer ? QR_BOX + 28 : 0; // QR + labels below it
      y = Math.max(payTopY + qrColH, midY) + 12;

    } else if (effectivePhone) {
      // ── Layout B: phone-only centred contact card ───────────────────────────
      const BW = 340, BH = 64;
      const BX = M + (W - BW) / 2;
      doc.save().roundedRect(BX, y, BW, BH, 6)
        .strokeColor(C.greenBorder).lineWidth(0.8).stroke().restore();
      doc.fillColor(C.muted).font("Helvetica").fontSize(7.6)
        .text("For payments or queries, contact us:", BX + 10, y + 10,
          { width: BW - 20, align: "center", lineBreak: false });
      doc.fillColor(C.text).font("Helvetica-Bold").fontSize(10.5)
        .text(`Ph / WhatsApp:  ${effectivePhone}`, BX + 10, y + 24,
          { width: BW - 20, align: "center", lineBreak: false });
      doc.fillColor(C.muted).font("Helvetica-Oblique").fontSize(7)
        .text("Share payment screenshot after transfer. Dhanyavaad!",
          BX + 10, y + 44, { width: BW - 20, align: "center", lineBreak: false });
      y += BH + 12;
    }
    // else: no UPI and no phone — skip payment section entirely

    doc.end();
  });
}
