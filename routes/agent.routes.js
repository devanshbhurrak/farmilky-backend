import { Router } from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { adminOnly } from "../middleware/adminMiddleware.js";
import {
  getAllUsersAdmin,
  createUserAdmin,
  updateUserAdmin,
  getUserByIdAdmin,
} from "../controllers/user.controller.js";
import {
  assignAgentArea,
  toggleAgentActive,
  deleteAgent,
  getAgentPerformance,
} from "../controllers/agent.controller.js";

const router = Router();

router.use(authMiddleware, adminOnly);

router.get("/", (req, res, next) => {
  req.query.role = "agent";
  req.query.skipEnrichment = "true";
  next();
}, getAllUsersAdmin);

router.get("/:id", getUserByIdAdmin);

router.post("/", (req, res, next) => {
  req.body.role = "agent";
  next();
}, createUserAdmin);

router.put("/:id", updateUserAdmin);

router.patch("/:id/status", toggleAgentActive);
router.put("/:id/assign-area", assignAgentArea);
router.delete("/:id", deleteAgent);
router.get("/:id/performance", getAgentPerformance);

export default router;
