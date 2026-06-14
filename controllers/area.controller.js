import Area from "../models/area.model.js";
import User from "../models/user.model.js";

export const createArea = async (req, res) => {
  try {
    const { name, pincodes, localities, assignedAgent } = req.body;
    if (!name) return res.status(400).json({ message: "Area name is required." });
    const area = await Area.create({ name, pincodes: pincodes || [], localities: localities || [], assignedAgent: assignedAgent || null });
    res.status(201).json({ message: "Area created.", area });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: "An area with this name already exists." });
    console.error("Create Area Error:", error);
    res.status(500).json({ message: "Failed to create area." });
  }
};

export const getAllAreas = async (req, res) => {
  try {
    const areas = await Area.find().populate("assignedAgent", "name email phone").sort({ name: 1 });
    res.status(200).json({ count: areas.length, areas });
  } catch (error) {
    console.error("Get Areas Error:", error);
    res.status(500).json({ message: "Failed to fetch areas." });
  }
};

export const getAreaById = async (req, res) => {
  try {
    const area = await Area.findById(req.params.id).populate("assignedAgent", "name email phone");
    if (!area) return res.status(404).json({ message: "Area not found." });
    res.status(200).json({ area });
  } catch (error) {
    console.error("Get Area Error:", error);
    res.status(500).json({ message: "Failed to fetch area." });
  }
};

export const updateArea = async (req, res) => {
  try {
    const { name, pincodes, localities, assignedAgent, isActive } = req.body;
    const area = await Area.findById(req.params.id);
    if (!area) return res.status(404).json({ message: "Area not found." });

    if (name !== undefined) area.name = name;
    if (pincodes !== undefined) area.pincodes = pincodes;
    if (localities !== undefined) area.localities = localities;
    if (isActive !== undefined) area.isActive = isActive;

    if (assignedAgent !== undefined) {
      const prevAgent = area.assignedAgent;
      area.assignedAgent = assignedAgent || null;

      if (assignedAgent) {
        await User.findByIdAndUpdate(assignedAgent, {
          assignedArea: area._id,
          "agentInfo.assignedArea": area._id,
        });
      }
      if (prevAgent && prevAgent.toString() !== assignedAgent?.toString()) {
        await User.findByIdAndUpdate(prevAgent, {
          assignedArea: null,
          "agentInfo.assignedArea": null,
        });
      }
    }

    await area.save();
    res.status(200).json({ message: "Area updated.", area });
  } catch (error) {
    console.error("Update Area Error:", error);
    res.status(500).json({ message: "Failed to update area." });
  }
};

export const deleteArea = async (req, res) => {
  try {
    const area = await Area.findByIdAndDelete(req.params.id);
    if (!area) return res.status(404).json({ message: "Area not found." });
    if (area.assignedAgent) {
      await User.findByIdAndUpdate(area.assignedAgent, {
        assignedArea: null,
        "agentInfo.assignedArea": null,
      });
    }
    res.status(200).json({ message: "Area deleted." });
  } catch (error) {
    console.error("Delete Area Error:", error);
    res.status(500).json({ message: "Failed to delete area." });
  }
};

export const getDeliveryAgents = async (req, res) => {
  try {
    const agents = await User.find(
      { role: { $in: ["delivery_partner", "delivery", "agent"] } },
      "name email phone assignedArea"
    ).populate("assignedArea", "name");
    res.status(200).json({ count: agents.length, agents });
  } catch (error) {
    console.error("Get Delivery Agents Error:", error);
    res.status(500).json({ message: "Failed to fetch delivery agents." });
  }
};
