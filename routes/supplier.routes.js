import { Router } from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { adminOnly } from "../middleware/adminMiddleware.js";
import {
  getAllSuppliers,
  getSupplierById,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  toggleSupplierStatus,
} from "../controllers/supplier.controller.js";

const router = Router();

router.use(authMiddleware, adminOnly);

router.get("/", getAllSuppliers);
router.post("/", createSupplier);
router.get("/:id", getSupplierById);
router.put("/:id", updateSupplier);
router.delete("/:id", deleteSupplier);
router.patch("/:id/status", toggleSupplierStatus);

export default router;
