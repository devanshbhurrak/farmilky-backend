import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { adminOnly } from "../middleware/adminMiddleware.js";
import {
  getMyPermissions,
  getPermissionRegistry,
  getRolePermissions,
  updateRolePermissions,
  resetRolePermissions,
} from "../controllers/permission.controller.js";

const router = express.Router();

// Agent/staff: fetch own resolved permissions (called on login + session restore)
router.get("/my", authMiddleware, getMyPermissions);

// Admin: manage role permission sets
router.get("/registry", authMiddleware, adminOnly, getPermissionRegistry);
router.get("/roles", authMiddleware, adminOnly, getRolePermissions);
router.put("/roles/:role", authMiddleware, adminOnly, updateRolePermissions);
router.post("/roles/:role/reset", authMiddleware, adminOnly, resetRolePermissions);

export default router;
