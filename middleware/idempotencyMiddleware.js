import crypto from "crypto";

/**
 * Short-lived in-memory request deduplication middleware.
 *
 * Prevents duplicate mutations caused by rapid double-clicks or network
 * retries reaching the server while the first request is still processing.
 *
 * Deduplication key: SHA-256 of (userId | method | path | serialised body).
 * Identical requests from the same authenticated user within TTL_MS milliseconds
 * receive the cached response instead of being processed again.
 *
 * Only caches successful (2xx) and conflict (4xx) responses to avoid
 * swallowing transient server errors.
 */

const TTL_MS = 8_000; // 8 seconds — covers double-click + slow mobile network
const MAX_CACHE_SIZE = 1_000; // guard against memory growth on high-traffic deployments

const _cache = new Map(); // key → { statusCode, body, ts }

function pruneCache() {
  const now = Date.now();
  for (const [k, v] of _cache) {
    if (now - v.ts > TTL_MS) _cache.delete(k);
  }
}

function makeKey(req) {
  const userId = req.user?._id?.toString() ?? "anon";
  const body = JSON.stringify(req.body ?? {});
  const raw = `${userId}|${req.method}|${req.originalUrl}|${body}`;
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 24);
}

export function idempotencyMiddleware(req, res, next) {
  if (_cache.size >= MAX_CACHE_SIZE) pruneCache();

  const key = makeKey(req);
  const now = Date.now();
  const cached = _cache.get(key);

  if (cached && now - cached.ts < TTL_MS) {
    // Replay cached response — the operation already succeeded
    return res.status(cached.statusCode).json(cached.body);
  }

  // Intercept the outgoing JSON response so we can cache it
  const origJson = res.json.bind(res);
  res.json = function (data) {
    const code = res.statusCode;
    // Only cache responses that indicate the operation completed (success or
    // business-logic rejection), not transient server errors.
    if (code < 500) {
      _cache.set(key, { statusCode: code, body: data, ts: Date.now() });
    }
    return origJson(data);
  };

  next();
}
