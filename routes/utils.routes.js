import express from "express";
import rateLimit from "express-rate-limit";

const router = express.Router();

// Moderate rate limit — this is a public endpoint used during sign-up
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,
  message: { message: "Too many requests. Please try again later." },
});

// Allowlist: only resolve known Google Maps hostnames
const ALLOWED_HOSTS = [
  "maps.app.goo.gl",
  "goo.gl",
  "maps.google.com",
  "www.google.com",
  "google.com",
];

const isAllowedUrl = (raw) => {
  try {
    const { hostname } = new URL(raw);
    return ALLOWED_HOSTS.includes(hostname);
  } catch {
    return false;
  }
};

/**
 * POST /api/utils/resolve-maps-link
 * Body: { url: string }
 * Follows redirects server-side (bypasses browser CORS) and returns the
 * final URL so the frontend can extract coordinates from it.
 */
router.post("/resolve-maps-link", limiter, async (req, res) => {
  const { url } = req.body;

  if (!url || typeof url !== "string") {
    return res.status(400).json({ message: "url is required." });
  }

  if (!isAllowedUrl(url)) {
    return res.status(422).json({ message: "Only Google Maps links are supported." });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        // Provide a browser User-Agent so Google doesn't serve a minimal redirect page
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36",
      },
      signal: controller.signal,
    });

    const resolvedUrl = response.url;

    // Ensure the final URL is still a trusted Google Maps domain
    if (!isAllowedUrl(resolvedUrl)) {
      return res.status(422).json({ message: "Resolved URL is not a Google Maps link." });
    }

    return res.json({ resolvedUrl });
  } catch (err) {
    console.error("[resolve-maps-link]", err.message);
    return res.status(502).json({ message: "Could not resolve the link. Please try the full URL." });
  } finally {
    clearTimeout(timeoutId);
  }
});

export default router;
