import { Router } from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { adminOnly } from "../middleware/adminMiddleware.js";
import {
  getOutstandingBySupplier,
  getCollectionTotalForPeriod,
  recordPayment,
  getPaymentHistory,
} from "../controllers/supplierPayment.controller.js";

const router = Router();

router.use(authMiddleware, adminOnly);

router.get("/outstanding", getOutstandingBySupplier);
router.get("/collection-total", getCollectionTotalForPeriod);
router.post("/", recordPayment);
router.get("/:supplierId", getPaymentHistory);

export default router;
