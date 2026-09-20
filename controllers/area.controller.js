import mongoose from "mongoose";
import Area from "../models/area.model.js";
import User from "../models/user.model.js";

export const createArea = async (req, res) => {
  try {
    const { name, pincodes, localities, assignedAgent, sequence } = req.body;
    if (!name) return res.status(400).json({ message: "Area name is required." });
    const area = await Area.create({ name, pincodes: pincodes || [], localities: localities || [], assignedAgent: assignedAgent || null, sequence: sequence ?? 0 });
    if (assignedAgent) {
      await User.findByIdAndUpdate(assignedAgent, {
        assignedArea: area._id,
        "agentInfo.assignedArea": area._id,
      });
    }
    res.status(201).json({ message: "Area created.", area });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: "An area with this name already exists." });
    console.error("Create Area Error:", error);
    res.status(500).json({ message: "Failed to create area." });
  }
};

export const getAllAreas = async (req, res) => {
  try {
    const { search, page, limit, sortBy, sortOrder } = req.query;
    const { parsePagination, buildPaginationMeta, escapeRegex } = await import("../utils/pagination.js");
    const wantsPagination = page != null || limit != null || search;
    if (!wantsPagination) {
      const areas = await Area.find().populate("assignedAgent", "name email phone").sort({ sequence: 1, name: 1 });
      return res.status(200).json({ areas, total: areas.length, page: 1, limit: areas.length || 1, totalPages: 1 });
    }
    const { page: p, limit: lim, skip, sort } = parsePagination(
      { page, limit, sortBy, sortOrder },
      { defaultLimit: 20, maxLimit: 100, defaultSort: { sequence: 1, name: 1 }, allowedSortFields: ["sequence","name","createdAt"] }
    );
    const filter = {};
    if (search) {
      const esc = escapeRegex(search.trim());
      filter.$or = [
        { name: { $regex: esc, $options: "i" } },
        { pincodes: { $regex: esc, $options: "i" } },
        { localities: { $regex: esc, $options: "i" } },
      ];
    }
    const [areas, total] = await Promise.all([
      Area.find(filter).populate("assignedAgent", "name email phone").sort(sort).skip(skip).limit(lim).lean(),
      Area.countDocuments(filter),
    ]);
    res.status(200).json({ areas, ...buildPaginationMeta(total, p, lim) });
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
    const { name, pincodes, localities, assignedAgent, isActive, sequence } = req.body;
    const area = await Area.findById(req.params.id);
    if (!area) return res.status(404).json({ message: "Area not found." });

    if (name !== undefined) area.name = name;
    if (pincodes !== undefined) area.pincodes = pincodes;
    if (localities !== undefined) area.localities = localities;
    if (isActive !== undefined) area.isActive = isActive;
    if (sequence !== undefined) area.sequence = sequence;

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
    const area = await Area.findById(req.params.id);
    if (!area) return res.status(404).json({ message: "Area not found." });

    const hasCustomers = await User.exists({ assignedArea: req.params.id, role: "customer" });
    if (hasCustomers) {
      return res.status(400).json({ message: "Area still has customers assigned. Unassign them before deleting." });
    }
    if (area.assignedAgent) {
      return res.status(400).json({ message: "Area still has an agent assigned. Unassign the agent before deleting." });
    }

    await Area.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: "Area deleted." });
  } catch (error) {
    console.error("Delete Area Error:", error);
    res.status(500).json({ message: "Failed to delete area." });
  }
};

export const getAreaCustomers = async (req, res) => {
  try {
    const area = await Area.findById(req.params.id);
    if (!area) return res.status(404).json({ message: "Area not found." });

    const { search, page, limit, sortBy, sortOrder } = req.query;
    const { parsePagination, buildPaginationMeta, escapeRegex, buildSearchOr } = await import("../utils/pagination.js");
    const wantsPagination = page != null || limit != null || search || sortBy;
    if (!wantsPagination) {
      const customers = await User.find(
        { assignedArea: req.params.id, role: "customer" },
        "name phone addresses deliverySequence assignedArea"
      ).sort({ deliverySequence: 1, name: 1 });
      return res.status(200).json({ customers, total: customers.length, page: 1, limit: customers.length || 1, totalPages: 1 });
    }
    const { page: p, limit: lim, skip, sort } = parsePagination(
      { page, limit, sortBy, sortOrder },
      { defaultLimit: 20, maxLimit: 100, defaultSort: { deliverySequence: 1, name: 1 }, allowedSortFields: ["deliverySequence","name","createdAt"] }
    );
    const filter = { assignedArea: req.params.id, role: "customer" };
    if (search) {
      const esc = escapeRegex(search.trim());
      filter.$or = buildSearchOr(esc, ["name","phone","email"]);
    }
    const [customers, total] = await Promise.all([
      User.find(filter, "name phone email addresses deliverySequence assignedArea").sort(sort).skip(skip).limit(lim).lean(),
      User.countDocuments(filter),
    ]);
    res.status(200).json({ customers, ...buildPaginationMeta(total, p, lim) });
  } catch (error) {
    console.error("Get Area Customers Error:", error);
    res.status(500).json({ message: "Failed to fetch area customers." });
  }
};

export const updateAreaCustomers = async (req, res) => {
  try {
    const area = await Area.findById(req.params.id);
    if (!area) return res.status(404).json({ message: "Area not found." });

    const { customers, removedCustomerIds = [] } = req.body;
    if (!Array.isArray(customers) || !Array.isArray(removedCustomerIds)) {
      return res.status(400).json({ message: "customers and removedCustomerIds must be arrays." });
    }

    for (const customerId of [...customers.map((c) => c.customerId), ...removedCustomerIds]) {
      if (!mongoose.Types.ObjectId.isValid(customerId)) {
        return res.status(400).json({ message: `Invalid customer ID: ${customerId}` });
      }
    }

    await Promise.all([
      ...customers.map(({ customerId, sequence }) =>
        User.findByIdAndUpdate(customerId, {
          assignedArea: req.params.id,
          deliverySequence: sequence ?? null,
        })
      ),
      ...removedCustomerIds.map((customerId) =>
        User.findByIdAndUpdate(customerId, {
          assignedArea: null,
          deliverySequence: null,
        })
      ),
    ]);

    res.status(200).json({ message: "Area customers updated." });
  } catch (error) {
    console.error("Update Area Customers Error:", error);
    res.status(500).json({ message: "Failed to update area customers." });
  }
};

export const getDeliveryAgents = async (req, res) => {
  try {
    const { search, page, limit, sortBy, sortOrder } = req.query;
    const { parsePagination, buildPaginationMeta, escapeRegex, buildSearchOr } = await import("../utils/pagination.js");
    const wantsPagination = page != null || limit != null || search || sortBy;
    if (!wantsPagination) {
      const agents = await User.find(
        { role: { $in: ["delivery_partner", "delivery", "agent"] } },
        "name email phone assignedArea"
      ).populate("assignedArea", "name");
      return res.status(200).json({ agents, total: agents.length, page: 1, limit: agents.length || 1, totalPages: 1 });
    }
    const { page: p, limit: lim, skip, sort } = parsePagination(
      { page, limit, sortBy, sortOrder },
      { defaultLimit: 20, maxLimit: 100, defaultSort: { createdAt: -1 }, allowedSortFields: ["createdAt","name"] }
    );
    const filter = { role: { $in: ["delivery_partner", "delivery", "agent"] } };
    if (search) {
      const esc = escapeRegex(search.trim());
      filter.$or = buildSearchOr(esc, ["name","email","phone"]);
    }
    const [agents, total] = await Promise.all([
      User.find(filter, "name email phone assignedArea").populate("assignedArea", "name").sort(sort).skip(skip).limit(lim).lean(),
      User.countDocuments(filter),
    ]);
    res.status(200).json({ agents, ...buildPaginationMeta(total, p, lim) });
  } catch (error) {
    console.error("Get Delivery Agents Error:", error);
    res.status(500).json({ message: "Failed to fetch delivery agents." });
  }
};
