import express from "express";
import {
  createProduct,
  getAllProducts,
  getProductById,
  updateProduct,
  deleteProduct,
} from "../controllers/product.controller.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { adminOnly } from "../middleware/adminMiddleware.js";

const router = express.Router();

router.get("/", getAllProducts);     
router.get("/:id", getProductById);
router.post("/", authMiddleware, adminOnly, createProduct);     
router.put("/:id", authMiddleware, adminOnly, updateProduct);  
router.delete("/:id", authMiddleware, adminOnly, deleteProduct); 

export default router;
