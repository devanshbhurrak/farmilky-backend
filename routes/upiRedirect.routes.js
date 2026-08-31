import { Router } from "express";

const router = Router();

/**
 * GET /pay/upi
 * Serves an HTML page that immediately launches the UPI app via JS.
 *
 * Why HTML instead of a 302 redirect:
 *   - PDF viewers open https:// links in the device browser ✓
 *   - Android Chrome / Samsung Internet / Firefox block 302 redirects to
 *     custom URI schemes (upi://) as a security measure.
 *   - But window.location = 'upi://...' from within a loaded page IS allowed
 *     and reliably opens the UPI app chooser on Android and iOS.
 *
 * Query params (standard UPI intent fields): pa, pn, am, tn
 */
router.get("/", (req, res) => {
  const { pa, pn, am, tn } = req.query;

  if (!pa) {
    return res.status(400).send("Missing UPI ID (pa).");
  }

  const params = new URLSearchParams({ pa });
  if (pn) params.set("pn", pn);
  if (am) params.set("am", am);
  params.set("cu", "INR");
  if (tn) params.set("tn", tn);

  const upiUri    = `upi://pay?${params.toString()}`;
  const amtDisplay = am ? `Rs. ${parseFloat(am).toFixed(2)}` : "";
  const upiIdSafe  = pa.replace(/</g, "&lt;").replace(/>/g, "&gt;");

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
    .logo { font-size: 28px; margin-bottom: 4px; }
    .brand { font-size: 18px; font-weight: 700; color: #1a4731; margin-bottom: 20px; }
    .status { font-size: 15px; color: #444; margin-bottom: 24px; line-height: 1.5; }
    .amount { font-size: 28px; font-weight: 700; color: #1a4731; margin: 8px 0; }
    .upi-id { font-size: 14px; color: #666; margin-bottom: 28px; }
    .upi-id span { font-weight: 600; color: #1a4731; }
    .btn {
      display: block;
      width: 100%;
      padding: 15px;
      border-radius: 12px;
      font-size: 16px;
      font-weight: 700;
      text-decoration: none;
      margin-bottom: 12px;
      cursor: pointer;
      border: none;
    }
    .btn-primary { background: #1a4731; color: #fff; }
    .btn-outline { background: #fff; color: #1a4731; border: 2px solid #1a4731; }
    .note { font-size: 12px; color: #999; margin-top: 20px; line-height: 1.6; }
    .spinner {
      width: 40px; height: 40px;
      border: 4px solid #d1fae5;
      border-top-color: #1a4731;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 20px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    #manual { display: none; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">🥛</div>
    <div class="brand">Farmilky</div>

    <!-- Auto-launch state -->
    <div id="launching">
      <div class="spinner"></div>
      <p class="status">Opening UPI app…</p>
      ${amtDisplay ? `<div class="amount">${amtDisplay}</div>` : ""}
      <div class="upi-id">UPI ID: <span>${upiIdSafe}</span></div>
    </div>

    <!-- Fallback if app didn't open -->
    <div id="manual">
      <p class="status">Tap the button below to open your UPI app with the amount prefilled.</p>
      ${amtDisplay ? `<div class="amount">${amtDisplay}</div>` : ""}
      <div class="upi-id">UPI ID: <span>${upiIdSafe}</span></div>
      <a class="btn btn-primary" href="${upiUri}">Open UPI App</a>
      <a class="btn btn-outline" href="${upiUri.replace("upi://pay", "gpay://upi/pay")}">Open Google Pay</a>
      <a class="btn btn-outline" href="${upiUri.replace("upi://", "phonepe://")}">Open PhonePe</a>
    </div>

    <p class="note">
      If no app opens, copy the UPI ID and pay manually inside any UPI app.
    </p>
  </div>

  <script>
    // Immediately try to open the UPI app
    window.location.href = "${upiUri}";

    // After 2 s, if we're still here the app didn't open — show manual buttons
    setTimeout(function () {
      document.getElementById("launching").style.display = "none";
      document.getElementById("manual").style.display   = "block";
    }, 2000);
  </script>
</body>
</html>`);
});

export default router;
