import User from "../models/user.model.js";
import Area from "../models/area.model.js";
import DeliveryManifest from "../models/deliveryManifest.model.js";

export const assignAgentArea = async (req, res) => {
  try {
    const { id } = req.params;
    const { areaId } = req.body;

    const agent = await User.findById(id);
    if (!agent || agent.role !== "agent") {
      return res.status(404).json({ message: "Agent not found." });
    }

    if (areaId) {
      const area = await Area.findById(areaId);
      if (!area) return res.status(404).json({ message: "Area not found." });
    }

    const prevAreaId = agent.agentInfo?.assignedArea;

    if (prevAreaId && prevAreaId.toString() !== areaId) {
      await Area.findByIdAndUpdate(prevAreaId, { assignedAgent: null });
    }

    if (areaId) {
      await Area.findByIdAndUpdate(areaId, { assignedAgent: id });
      await User.findByIdAndUpdate(id, {
        assignedArea: areaId,
        "agentInfo.assignedArea": areaId,
      });
    } else {
      await User.findByIdAndUpdate(id, {
        assignedArea: null,
        "agentInfo.assignedArea": null,
      });
    }

    const updated = await User.findById(id).select("-password").populate("agentInfo.assignedArea", "name");
    res.status(200).json({ message: "Agent area assigned.", user: updated });
  } catch (error) {
    console.error("Assign Agent Area Error:", error);
    res.status(500).json({ message: "Failed to assign area." });
  }
};

export const toggleAgentActive = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    const user = await User.findById(id);
    if (!user || user.role !== "agent") {
      return res.status(404).json({ message: "Agent not found." });
    }

    if (isActive === false && user.agentInfo?.assignedArea) {
      await Area.findByIdAndUpdate(user.agentInfo.assignedArea, { assignedAgent: null });
    }

    user.isActive = isActive ?? !user.isActive;
    if (!user.isActive) {
      user.agentInfo.assignedArea = null;
      user.assignedArea = null;
    }
    user.updatedBy = req.user._id;
    await user.save();

    res.status(200).json({
      message: user.isActive ? "Agent activated." : "Agent deactivated.",
      user: { id: user._id, name: user.name, isActive: user.isActive },
    });
  } catch (error) {
    console.error("Toggle Agent Active Error:", error);
    res.status(500).json({ message: "Failed to update agent status." });
  }
};

export const deleteAgent = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);
    if (!user || user.role !== "agent") {
      return res.status(404).json({ message: "Agent not found." });
    }

    if (user.agentInfo?.assignedArea) {
      await Area.findByIdAndUpdate(user.agentInfo.assignedArea, { assignedAgent: null });
    }

    user.isActive = false;
    user.assignedArea = null;
    user.agentInfo.assignedArea = null;
    user.agentInfo.availability = "offline";
    user.updatedBy = req.user._id;
    await user.save();

    res.status(200).json({ message: "Agent deleted." });
  } catch (error) {
    console.error("Delete Agent Error:", error);
    res.status(500).json({ message: "Failed to delete agent." });
  }
};

export const getAgentPerformance = async (req, res) => {
  try {
    const { id } = req.params;
    const agent = await User.findById(id).select("name email role");
    if (!agent || agent.role !== "agent") {
      return res.status(404).json({ message: "Agent not found." });
    }

    const [performance, recentActivity] = await Promise.all([
      DeliveryManifest.aggregate([
        { $match: { agentId: agent._id } },
        { $unwind: "$entries" },
        {
          $group: {
            _id: null,
            totalDeliveries: { $sum: 1 },
            successfulDeliveries: {
              $sum: { $cond: [{ $eq: ["$entries.status", "delivered"] }, 1, 0] },
            },
            failedDeliveries: {
              $sum: { $cond: [{ $eq: ["$entries.status", "failed"] }, 1, 0] },
            },
            skippedDeliveries: {
              $sum: { $cond: [{ $eq: ["$entries.status", "skipped"] }, 1, 0] },
            },
            lastDeliveryDate: { $max: "$entries.deliveredAt" },
          },
        },
      ]),
      DeliveryManifest.find({ agentId: agent._id })
        .sort({ date: -1 })
        .limit(10)
        .select("date summary status"),
    ]);

    const stats = performance[0] || {
      totalDeliveries: 0,
      successfulDeliveries: 0,
      failedDeliveries: 0,
      skippedDeliveries: 0,
      lastDeliveryDate: null,
    };

    stats.successRate = stats.totalDeliveries > 0
      ? Math.round((stats.successfulDeliveries / stats.totalDeliveries) * 100)
      : 0;

    res.status(200).json({ performance: stats, recentActivity });
  } catch (error) {
    console.error("Get Agent Performance Error:", error);
    res.status(500).json({ message: "Failed to fetch agent performance." });
  }
};
