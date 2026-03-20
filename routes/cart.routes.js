import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import {
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart,
} from "../controllers/cart.controller.js";

const router = express.Router();

router.get("/", authMiddleware, getCart);
router.post("/add", authMiddleware, addToCart);
router.put("/update", authMiddleware, updateCartItem);
router.delete("/remove", authMiddleware, removeFromCart);
router.delete("/clear", authMiddleware, clearCart);

export default router;
