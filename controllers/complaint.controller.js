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
    const complaints = await Complaint.find({ userId }).sort({ createdAt: -1 });
    res.status(200).json({ count: complaints.length, complaints });
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
    const { status, relatedTo } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (relatedTo) filter.relatedTo = relatedTo;
    const complaints = await Complaint.find(filter)
      .populate("userId", "name email phone")
      .sort({ createdAt: -1 });
    res.status(200).json({ count: complaints.length, complaints });
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
