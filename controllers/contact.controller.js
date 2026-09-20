import ContactMessage from "../models/contactMessage.model.js";
import mongoose from "mongoose";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const submitContactMessage = async (req, res) => {
  try {
    const { name, email, message } = req.body;

    if (typeof name !== 'string' || typeof email !== 'string' || typeof message !== 'string') {
      return res.status(400).json({ message: "Invalid input." });
    }

    if (!name.trim() || !email.trim() || !message.trim()) {
      return res.status(400).json({ message: "Name, email, and message are required." });
    }

    if (!EMAIL_REGEX.test(email.trim())) {
      return res.status(400).json({ message: "Please provide a valid email address." });
    }

    if (name.trim().length < 2) {
      return res.status(400).json({ message: "Name must be at least 2 characters." });
    }

    if (name.trim().length > 100) {
      return res.status(400).json({ message: "Name must be 100 characters or fewer." });
    }

    if (message.trim().length < 10) {
      return res.status(400).json({ message: "Message must be at least 10 characters." });
    }

    if (message.trim().length > 2000) {
      return res.status(400).json({ message: "Message must be 2000 characters or fewer." });
    }

    await ContactMessage.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      message: message.trim(),
    });

    res.status(201).json({ message: "Message received. We'll get back to you soon!" });
  } catch (error) {
    console.error("Submit Contact Message Error:", error);
    res.status(500).json({ message: "Failed to send message. Please try again." });
  }
};

export const getAllContactMessagesAdmin = async (req, res) => {
  try {
    const { status, search, page, limit, sortBy, sortOrder } = req.query;
    const { parsePagination, buildPaginationMeta, escapeRegex } = await import("../utils/pagination.js");
    const { page: p, limit: lim, skip, sort } = parsePagination(
      { page, limit, sortBy, sortOrder },
      { defaultLimit: 20, maxLimit: 100, defaultSort: { createdAt: -1 }, allowedSortFields: ["createdAt","status","name"] }
    );
    const filter = {};
    if (status) filter.status = status;
    if (search) {
      const esc = escapeRegex(search.trim());
      filter.$or = [
        { name: { $regex: esc, $options: "i" } },
        { email: { $regex: esc, $options: "i" } },
        { message: { $regex: esc, $options: "i" } },
      ];
    }
    const [messages, total] = await Promise.all([
      ContactMessage.find(filter).sort(sort).skip(skip).limit(lim).lean(),
      ContactMessage.countDocuments(filter),
    ]);
    res.status(200).json({ messages, ...buildPaginationMeta(total, p, lim) });
  } catch (error) {
    console.error("Get All Contact Messages Error:", error);
    res.status(500).json({ message: "Failed to fetch messages." });
  }
};

export const updateContactMessageStatus = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid message ID." });
    }
    const { status } = req.body;
    const validStatuses = ["unread", "read", "replied"];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ message: "Status must be unread, read, or replied." });
    }
    const msg = await ContactMessage.findByIdAndUpdate(
      id,
      { status },
      { new: true, runValidators: true }
    );
    if (!msg) return res.status(404).json({ message: "Message not found." });
    res.status(200).json({ message: "Status updated.", contactMessage: msg });
  } catch (error) {
    console.error("Update Contact Message Status Error:", error);
    res.status(500).json({ message: "Failed to update status." });
  }
};
