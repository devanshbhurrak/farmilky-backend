import RolePermission from "../models/rolePermission.model.js";
import {
  ALL_PERMISSIONS,
  PERMISSION_META,
  DEFAULT_ROLE_PERMISSIONS,
} from "../constants/permissions.js";
import { invalidatePermissionCache } from "../middleware/permissionMiddleware.js";

const MANAGED_ROLES = ["agent", "delivery", "delivery_partner"];

/**
 * GET /api/permissions/my
 * Returns the current user's resolved permission set.
 * Admin gets ["*"] — frontend interprets this as all-access.
 */
export const getMyPermissions = async (req, res) => {
  try {
    const { role } = req.user;

    if (role === "admin") {
      return res.status(200).json({ permissions: ["*"] });
    }

    if (!MANAGED_ROLES.includes(role)) {
      return res.status(200).json({ permissions: [] });
    }

    const doc = await RolePermission.findOne({ role }).lean();
    const permissions = doc ? doc.permissions : (DEFAULT_ROLE_PERMISSIONS[role] ?? []);

    res.status(200).json({ permissions });
  } catch (err) {
    console.error("Get My Permissions Error:", err);
    res.status(500).json({ message: "Failed to fetch permissions." });
  }
};

/**
 * GET /api/permissions/registry
 * Returns all known permission keys with their labels and groups.
 * Used by the admin UI to render toggles.
 */
export const getPermissionRegistry = async (_req, res) => {
  try {
    const registry = ALL_PERMISSIONS.map((key) => ({
      key,
      label: PERMISSION_META[key]?.label ?? key,
      group: PERMISSION_META[key]?.group ?? "Other",
    }));
    res.status(200).json({ registry });
  } catch (err) {
    console.error("Get Registry Error:", err);
    res.status(500).json({ message: "Failed to fetch permission registry." });
  }
};

/**
 * GET /api/permissions/roles
 * Returns all managed roles with their current permission arrays.
 * Lazy-seeds from defaults if no document exists for a role.
 */
export const getRolePermissions = async (req, res) => {
  try {
    // Ensure all roles have documents (lazy seed on first admin view)
    const existingDocs = await RolePermission.find({ role: { $in: MANAGED_ROLES } }).lean();
    const existingRoles = new Set(existingDocs.map((d) => d.role));

    const toCreate = MANAGED_ROLES.filter((r) => !existingRoles.has(r));
    if (toCreate.length > 0) {
      await RolePermission.insertMany(
        toCreate.map((role) => ({
          role,
          permissions: DEFAULT_ROLE_PERMISSIONS[role] ?? [],
          updatedBy: req.user._id,
        }))
      );
    }

    const allDocs = await RolePermission.find({ role: { $in: MANAGED_ROLES } })
      .populate("updatedBy", "name")
      .lean();

    const roles = allDocs.map((doc) => ({
      role: doc.role,
      permissions: doc.permissions,
      updatedBy: doc.updatedBy,
      updatedAt: doc.updatedAt,
    }));

    res.status(200).json({ roles });
  } catch (err) {
    console.error("Get Role Permissions Error:", err);
    res.status(500).json({ message: "Failed to fetch role permissions." });
  }
};

/**
 * PUT /api/permissions/roles/:role
 * Updates the permission set for a role.
 * Validates all keys against the registry.
 * Invalidates the in-memory cache for the role after update.
 */
export const updateRolePermissions = async (req, res) => {
  try {
    const { role } = req.params;
    const { permissions } = req.body;

    if (!MANAGED_ROLES.includes(role)) {
      return res.status(400).json({ message: `Invalid role. Must be one of: ${MANAGED_ROLES.join(", ")}.` });
    }

    if (!Array.isArray(permissions)) {
      return res.status(400).json({ message: "permissions must be an array of strings." });
    }

    const invalid = permissions.filter((p) => !ALL_PERMISSIONS.includes(p));
    if (invalid.length > 0) {
      return res.status(400).json({
        message: "One or more permission keys are invalid.",
        invalid,
        valid: ALL_PERMISSIONS,
      });
    }

    const doc = await RolePermission.findOneAndUpdate(
      { role },
      { permissions, updatedBy: req.user._id },
      { upsert: true, new: true }
    );

    // Invalidate cache so the change takes effect immediately (no 60s wait)
    invalidatePermissionCache(role);

    res.status(200).json({
      message: `Permissions for "${role}" updated.`,
      role: {
        role: doc.role,
        permissions: doc.permissions,
        updatedAt: doc.updatedAt,
      },
    });
  } catch (err) {
    console.error("Update Role Permissions Error:", err);
    res.status(500).json({ message: "Failed to update permissions." });
  }
};

/**
 * POST /api/permissions/roles/:role/reset
 * Resets a role's permissions to the system defaults.
 */
export const resetRolePermissions = async (req, res) => {
  try {
    const { role } = req.params;

    if (!MANAGED_ROLES.includes(role)) {
      return res.status(400).json({ message: `Invalid role.` });
    }

    const defaults = DEFAULT_ROLE_PERMISSIONS[role] ?? [];

    const doc = await RolePermission.findOneAndUpdate(
      { role },
      { permissions: defaults, updatedBy: req.user._id },
      { upsert: true, new: true }
    );

    invalidatePermissionCache(role);

    res.status(200).json({
      message: `Permissions for "${role}" reset to defaults.`,
      role: { role: doc.role, permissions: doc.permissions, updatedAt: doc.updatedAt },
    });
  } catch (err) {
    console.error("Reset Role Permissions Error:", err);
    res.status(500).json({ message: "Failed to reset permissions." });
  }
};
