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
import {
  getSupplierPassbook,
  createAdjustment,
  deleteAdjustment,
} from "../controllers/supplierAdjustment.controller.js";

const router = Router();

router.use(authMiddleware, adminOnly);

router.get("/", getAllSuppliers);
router.post("/", createSupplier);
router.get("/:id", getSupplierById);
router.put("/:id", updateSupplier);
router.delete("/:id", deleteSupplier);
router.patch("/:id/status", toggleSupplierStatus);

router.get("/:supplierId/passbook", getSupplierPassbook);
router.post("/:supplierId/adjustments", createAdjustment);
router.delete("/:supplierId/adjustments/:id", deleteAdjustment);

export default router;
