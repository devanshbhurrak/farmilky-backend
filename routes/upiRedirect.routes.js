import { Router } from "express";

const router = Router();

/**
 * GET /pay/upi
 * Public redirect endpoint: bounces the browser to a upi:// deep-link so that
 * tapping an https:// link in a PDF viewer (which blocks custom URI schemes)
 * still opens the UPI app chooser on Android/iOS.
 *
 * Query params: pa, pn, am, tn  (standard UPI intent fields)
 */
router.get("/", (req, res) => {
  const { pa, pn, am, tn } = req.query;

  if (!pa) {
    return res.status(400).send("Missing UPI ID (pa)");
  }

  const params = new URLSearchParams({ pa });
  if (pn) params.set("pn", pn);
  if (am) params.set("am", am);
  params.set("cu", "INR");
  if (tn) params.set("tn", tn);

  const upiUri = `upi://pay?${params.toString()}`;

  // Redirect the browser — on Android/iOS the OS intercepts upi:// and
  // launches the UPI app chooser. On desktop it silently fails (expected).
  res.redirect(302, upiUri);
});

export default router;
