import express from "express";
import { registerUser, loginUser, logoutUser, updateProfile, getUserProfile } from "../controllers/user.controller.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/register", registerUser);
router.post("/login", loginUser);
router.post("/logout", authMiddleware, logoutUser);
router.put("/profile", authMiddleware, updateProfile);
router.get("/profile", authMiddleware, getUserProfile);

export default router;
