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
import User from "../models/user.model.js";

const router = Router();

router.use(authMiddleware, adminOnly);

// Ensures the :id param resolves to a delivery agent, not any other user type.
const enforceAgentRole = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select("role");
    if (!user || user.role !== "agent") {
      return res.status(404).json({ message: "Agent not found." });
    }
    next();
  } catch {
    res.status(500).json({ message: "Failed to verify agent." });
  }
};

router.get("/", (req, res, next) => {
  req.query.role = "agent";
  req.query.skipEnrichment = "true";
  next();
}, getAllUsersAdmin);

router.get("/:id", enforceAgentRole, getUserByIdAdmin);

router.post("/", (req, res, next) => {
  req.body.role = "agent";
  next();
}, createUserAdmin);

router.put("/:id", enforceAgentRole, (req, res, next) => {
  // Role changes are not permitted through the agents endpoint.
  delete req.body.role;
  next();
}, updateUserAdmin);

router.patch("/:id/status", toggleAgentActive);
router.put("/:id/assign-area", assignAgentArea);
router.delete("/:id", deleteAgent);
router.get("/:id/performance", getAgentPerformance);

export default router;
