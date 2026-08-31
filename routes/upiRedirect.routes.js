import { Router } from "express";

const router = Router();

/**
 * GET /pay/upi
 * Opens the UPI app chooser on Android and iOS from a PDF tap button.
 *
 * Why not upi:// directly in the PDF:
 *   PDF viewers block custom URI schemes — only https:// opens in browser.
 *
 * Why not window.location = 'upi://' in JS:
 *   Chrome on Android blocks automatic JS navigation to custom schemes
 *   without a user gesture (silent security block → spinner forever).
 *
 * Solution:
 *   Android → 302 redirect to intent:// URL.
 *     Android OS intercepts intent:// at system level (bypasses Chrome's
 *     gesture requirement) and shows the UPI app chooser with amount prefilled.
 *   iOS / Desktop → HTML page with a prominent upi:// tap button.
 *
 * Query params (standard UPI intent fields): pa, pn, am, tn
 */
router.get("/", (req, res) => {
  const { pa, pn, am, tn } = req.query;

  if (!pa) return res.status(400).send("Missing UPI ID (pa).");

  const upiParams = new URLSearchParams({ pa });
  if (pn) upiParams.set("pn", pn);
  if (am) upiParams.set("am", am);
  upiParams.set("cu", "INR");
  if (tn) upiParams.set("tn", tn);

  const upiUri    = `upi://pay?${upiParams.toString()}`;
  // intent:// URL — Android OS routes this directly to the UPI app chooser
  const intentUri = `intent://pay?${upiParams.toString()}#Intent;scheme=upi;end`;

  const ua        = req.headers["user-agent"] || "";
  const isAndroid = /android/i.test(ua);

  // Android: system-level redirect — opens UPI app chooser immediately
  if (isAndroid) {
    return res.redirect(302, intentUri);
  }

  // iOS / Desktop: serve a page with a direct upi:// tap button
  const amtDisplay = am ? `Rs. ${parseFloat(am).toFixed(2)}` : "";
  const upiIdSafe  = String(pa).replace(/</g, "&lt;").replace(/>/g, "&gt;");

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Pay via UPI – Farmilky</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #f0faf4;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      background: #fff;
      border-radius: 16px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.08);
      padding: 32px 28px;
      max-width: 360px;
      width: 100%;
      text-align: center;
    }
    .logo  { font-size: 28px; margin-bottom: 4px; }
    .brand { font-size: 18px; font-weight: 700; color: #1a4731; margin-bottom: 20px; }
    .label { font-size: 13px; color: #888; margin-bottom: 4px; }
    .amount { font-size: 32px; font-weight: 700; color: #1a4731; margin-bottom: 6px; }
    .upi-id {
      font-size: 13px; font-weight: 600; color: #1a4731;
      background: #f0faf4; border-radius: 8px;
      padding: 8px 14px; margin-bottom: 28px; display: inline-block;
    }
    .btn {
      display: block; width: 100%;
      padding: 16px; border-radius: 12px;
      font-size: 16px; font-weight: 700;
      text-decoration: none; margin-bottom: 12px;
      cursor: pointer; border: none;
    }
    .btn-primary { background: #1a4731; color: #fff; }
    .btn-outline { background: #fff; color: #1a4731; border: 2px solid #1a4731; font-size: 14px; padding: 12px; }
    .note { font-size: 12px; color: #aaa; margin-top: 20px; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">🥛</div>
    <div class="brand">Farmilky</div>
    ${amtDisplay ? `<div class="label">Amount Due</div><div class="amount">${amtDisplay}</div>` : ""}
    <div class="upi-id">${upiIdSafe}</div>

    <a class="btn btn-primary" href="${upiUri}">Open UPI App</a>
    <a class="btn btn-outline" href="${upiUri.replace("upi://pay", "gpay://upi/pay")}">Open Google Pay</a>
    <a class="btn btn-outline" href="${upiUri.replace("upi://pay", "phonepe://pay")}">Open PhonePe</a>

    <p class="note">Tap any button to open your UPI app with the amount prefilled.<br/>After payment, share a screenshot as confirmation.</p>
  </div>
</body>
</html>`);
});

export default router;
