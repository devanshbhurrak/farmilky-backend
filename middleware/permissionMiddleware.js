import RolePermission from "../models/rolePermission.model.js";
import { DEFAULT_ROLE_PERMISSIONS } from "../constants/permissions.js";

/**
 * In-memory permission cache: role → { permissions: string[], expiresAt: number }
 * Avoids a DB round-trip on every request. TTL is 60 seconds.
 * Invalidated explicitly when admin updates a role's permissions.
 */
const permCache = new Map();
const CACHE_TTL_MS = 60_000;

const DELIVERY_ROLES = new Set(["delivery", "delivery_partner", "agent"]);

async function resolveRolePermissions(role) {
  const cached = permCache.get(role);
  if (cached && cached.expiresAt > Date.now()) return cached.permissions;

  const doc = await RolePermission.findOne({ role }).lean();
  const permissions = doc ? doc.permissions : (DEFAULT_ROLE_PERMISSIONS[role] ?? []);

  permCache.set(role, { permissions, expiresAt: Date.now() + CACHE_TTL_MS });
  return permissions;
}

/**
 * Invalidate cached permissions for one role, or all delivery roles if called with no argument.
 * Call this from the permissions controller after any update.
 */
export function invalidatePermissionCache(role) {
  if (role) {
    permCache.delete(role);
  } else {
    for (const r of DELIVERY_ROLES) permCache.delete(r);
  }
}

/**
 * requirePermission("manifest.view_today", "manifest.update")
 *
 * Creates an Express middleware that enforces all listed permission keys.
 * Admin role always passes. Non-delivery roles that somehow reach this check are denied.
 *
 * Usage:
 *   router.put("/entry", authMiddleware, requirePermission("manifest.update"), handler);
 */
export function requirePermission(...requiredKeys) {
  return async (req, res, next) => {
    try {
      const { role } = req.user;

      // Admin is omnipotent — skip all checks.
      if (role === "admin") return next();

      // Only delivery-type roles can have permissions; everyone else is denied.
      if (!DELIVERY_ROLES.has(role)) {
        return res.status(403).json({ message: "Access denied." });
      }

      const rolePerms = await resolveRolePermissions(role);
      const denied = requiredKeys.filter((k) => !rolePerms.includes(k));

      if (denied.length > 0) {
        return res.status(403).json({
          message: "Insufficient permissions.",
          missing: denied,
        });
      }

      next();
    } catch (err) {
      console.error("Permission check error:", err);
      res.status(500).json({ message: "Permission check failed." });
    }
  };
}
