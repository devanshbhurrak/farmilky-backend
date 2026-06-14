import express from "express";
import { registerUser, loginUser, logoutUser, updateProfile, getUserProfile, getAllUsersAdmin, getUserByIdAdmin, createUserAdmin, updateUserAdmin } from "../controllers/user.controller.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { adminOnly } from "../middleware/adminMiddleware.js";

const router = express.Router();

router.post("/register", registerUser);
router.post("/login", loginUser);
router.post("/logout", authMiddleware, logoutUser);
router.put("/profile", authMiddleware, updateProfile);
router.get("/profile", authMiddleware, getUserProfile);
router.get("/admin/all", authMiddleware, adminOnly, getAllUsersAdmin);
router.get("/admin/:id", authMiddleware, adminOnly, getUserByIdAdmin);
router.post("/admin/create", authMiddleware, adminOnly, createUserAdmin);
router.put("/admin/:id", authMiddleware, adminOnly, updateUserAdmin);

export default router;
