import Return from "../models/return.model.js";
import Order from "../models/order.model.js";

const RETURN_WINDOW_HOURS = 24;

export const requestReturn = async (req, res) => {
  try {
    const userId = req.user._id;
    const { orderId, reason } = req.body;
    if (!orderId || !reason?.trim()) {
      return res.status(400).json({ message: "orderId and reason are required." });
    }

    const order = await Order.findOne({ _id: orderId, userId });
    if (!order) return res.status(404).json({ message: "Order not found." });
    if (order.orderStatus !== "delivered") {
      return res.status(400).json({ message: "Only delivered orders can be returned." });
    }

    // 24-hour window from delivery time
    const deliveredAt = order.deliveredAt || order.updatedAt;
    const windowMs = RETURN_WINDOW_HOURS * 60 * 60 * 1000;
    if (Date.now() - new Date(deliveredAt).getTime() > windowMs) {
      return res.status(400).json({ message: `Return window has closed (${RETURN_WINDOW_HOURS}h after delivery).` });
    }

    const existing = await Return.findOne({ orderId, userId, status: { $in: ["requested", "approved"] } });
    if (existing) {
      return res.status(409).json({ message: "A return request already exists for this order." });
    }

    const returnRequest = await Return.create({ orderId, userId, reason: reason.trim() });
    res.status(201).json({ message: "Return request submitted.", returnRequest });
  } catch (error) {
    console.error("Request Return Error:", error);
    res.status(500).json({ message: "Failed to submit return request." });
  }
};

export const getMyReturns = async (req, res) => {
  try {
    const userId = req.user._id;
    const returns = await Return.find({ userId })
      .populate("orderId", "items totalAmount createdAt orderStatus")
      .sort({ createdAt: -1 });
    res.status(200).json({ count: returns.length, returns });
  } catch (error) {
    console.error("Get My Returns Error:", error);
    res.status(500).json({ message: "Failed to fetch return requests." });
  }
};

export const getAllReturnsAdmin = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = {};
    if (status) filter.status = status;
    const returns = await Return.find(filter)
      .populate("userId", "name email phone")
      .populate("orderId", "items totalAmount createdAt")
      .sort({ createdAt: -1 });
    res.status(200).json({ count: returns.length, returns });
  } catch (error) {
    console.error("Get All Returns Admin Error:", error);
    res.status(500).json({ message: "Failed to fetch return requests." });
  }
};

export const updateReturnStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, refundAmount, adminNotes } = req.body;
    const returnRequest = await Return.findById(id);
    if (!returnRequest) return res.status(404).json({ message: "Return request not found." });
    if (status) returnRequest.status = status;
    if (refundAmount !== undefined) returnRequest.refundAmount = refundAmount;
    if (adminNotes !== undefined) returnRequest.adminNotes = adminNotes;
    if (["approved", "rejected", "completed"].includes(status) && !returnRequest.resolvedAt) {
      returnRequest.resolvedAt = new Date();
    }
    await returnRequest.save();
    res.status(200).json({ message: "Return request updated.", returnRequest });
  } catch (error) {
    console.error("Update Return Error:", error);
    res.status(500).json({ message: "Failed to update return request." });
  }
};
