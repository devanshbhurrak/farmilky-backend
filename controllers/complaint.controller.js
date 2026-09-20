import Complaint from "../models/complaint.model.js";

export const createComplaint = async (req, res) => {
  try {
    const userId = req.user._id;
    const { relatedTo, referenceId, subject, description } = req.body;
    if (!relatedTo || !subject || !description) {
      return res.status(400).json({ message: "relatedTo, subject, and description are required." });
    }
    const complaint = await Complaint.create({
      userId,
      relatedTo,
      referenceId: referenceId || null,
      subject,
      description,
    });
    res.status(201).json({ message: "Complaint submitted.", complaint });
  } catch (error) {
    console.error("Create Complaint Error:", error);
    res.status(500).json({ message: "Failed to submit complaint." });
  }
};

export const getMyComplaints = async (req, res) => {
  try {
    const userId = req.user._id;
    const { page, limit, sortBy, sortOrder, search, status } = req.query;
    const wantsPagination = page != null || limit != null || search || status || sortBy;
    if (!wantsPagination) {
      const complaints = await Complaint.find({ userId }).sort({ createdAt: -1 });
      return res.status(200).json({ count: complaints.length, complaints, total: complaints.length, page: 1, limit: complaints.length || 1, totalPages: 1 });
    }
    const { parsePagination, buildPaginationMeta, escapeRegex } = await import("../utils/pagination.js");
    const { page: p, limit: lim, skip, sort } = parsePagination(
      { page, limit, sortBy, sortOrder },
      { defaultLimit: 10, maxLimit: 50, defaultSort: { createdAt: -1 }, allowedSortFields: ["createdAt","status"] }
    );
    const filter = { userId };
    if (status && status !== "all") filter.status = status;
    if (search) {
      const esc = escapeRegex(search.trim());
      filter.$or = [
        { subject: { $regex: esc, $options: "i" } },
        { description: { $regex: esc, $options: "i" } },
      ];
    }
    const [complaints, total] = await Promise.all([
      Complaint.find(filter).sort(sort).skip(skip).limit(lim).lean(),
      Complaint.countDocuments(filter),
    ]);
    res.status(200).json({ complaints, count: total, total, ...buildPaginationMeta(total, p, lim) });
  } catch (error) {
    console.error("Get My Complaints Error:", error);
    res.status(500).json({ message: "Failed to fetch complaints." });
  }
};

export const getComplaintById = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;
    const complaint = await Complaint.findOne({ _id: id, userId });
    if (!complaint) return res.status(404).json({ message: "Complaint not found." });
    res.status(200).json({ complaint });
  } catch (error) {
    console.error("Get Complaint Error:", error);
    res.status(500).json({ message: "Failed to fetch complaint." });
  }
};

export const getAllComplaintsAdmin = async (req, res) => {
  try {
    const { status, relatedTo, search, page, limit, sortBy, sortOrder } = req.query;
    const { parsePagination, buildPaginationMeta, escapeRegex, buildSearchOr } = await import("../utils/pagination.js");
    const { page: p, limit: lim, skip, sort } = parsePagination(
      { page, limit, sortBy, sortOrder },
      { defaultLimit: 20, maxLimit: 100, defaultSort: { createdAt: -1 }, allowedSortFields: ["createdAt","status","subject"] }
    );
    const filter = {};
    if (status) filter.status = status;
    if (relatedTo) filter.relatedTo = relatedTo;
    if (search) {
      const esc = escapeRegex(search.trim());
      // Search on complaint subject/description + populated user name/email via lookup
      // For simplicity, apply regex on complaint fields and also include user search
      const userIds = await (await import("../models/user.model.js")).default.find({ $or: buildSearchOr(esc, ["name","email","phone"]) }).select("_id").lean();
      filter.$or = [
        { subject: { $regex: esc, $options: "i" } },
        { description: { $regex: esc, $options: "i" } },
        ...(userIds.length ? [{ userId: { $in: userIds.map((u) => u._id) } }] : []),
      ];
    }
    const [complaints, total] = await Promise.all([
      Complaint.find(filter).populate("userId", "name email phone").sort(sort).skip(skip).limit(lim).lean(),
      Complaint.countDocuments(filter),
    ]);
    res.status(200).json({ complaints, ...buildPaginationMeta(total, p, lim) });
  } catch (error) {
    console.error("Get All Complaints Admin Error:", error);
    res.status(500).json({ message: "Failed to fetch complaints." });
  }
};

export const updateComplaintStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, resolution } = req.body;
    const complaint = await Complaint.findById(id);
    if (!complaint) return res.status(404).json({ message: "Complaint not found." });
    if (status) complaint.status = status;
    if (resolution !== undefined) complaint.resolution = resolution;
    if ((status === "resolved" || status === "closed") && !complaint.resolvedAt) {
      complaint.resolvedAt = new Date();
    }
    await complaint.save();
    res.status(200).json({ message: "Complaint updated.", complaint });
  } catch (error) {
    console.error("Update Complaint Status Error:", error);
    res.status(500).json({ message: "Failed to update complaint." });
  }
};
