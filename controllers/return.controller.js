import mongoose from "mongoose";
import Return from "../models/return.model.js";
import Order from "../models/order.model.js";
import Payment from "../models/payment.model.js";
import User from "../models/user.model.js";

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
    const { page, limit, sortBy, sortOrder } = req.query;
    const wantsPagination = page != null || limit != null || sortBy;
    if (!wantsPagination) {
      const returns = await Return.find({ userId }).populate("orderId", "items totalAmount createdAt orderStatus").sort({ createdAt: -1 });
      return res.status(200).json({ count: returns.length, returns, total: returns.length, page: 1, limit: returns.length || 1, totalPages: 1 });
    }
    const { parsePagination, buildPaginationMeta } = await import("../utils/pagination.js");
    const { page: p, limit: lim, skip, sort } = parsePagination(
      { page, limit, sortBy, sortOrder },
      { defaultLimit: 10, maxLimit: 50, defaultSort: { createdAt: -1 }, allowedSortFields: ["createdAt","status"] }
    );
    const [returns, total] = await Promise.all([
      Return.find({ userId }).populate("orderId", "items totalAmount createdAt orderStatus").sort(sort).skip(skip).limit(lim).lean(),
      Return.countDocuments({ userId }),
    ]);
    res.status(200).json({ returns, count: total, total, ...buildPaginationMeta(total, p, lim) });
  } catch (error) {
    console.error("Get My Returns Error:", error);
    res.status(500).json({ message: "Failed to fetch return requests." });
  }
};

export const getAllReturnsAdmin = async (req, res) => {
  try {
    const { status, search, page, limit, sortBy, sortOrder } = req.query;
    const { parsePagination, buildPaginationMeta, escapeRegex, buildSearchOr } = await import("../utils/pagination.js");
    const { page: p, limit: lim, skip, sort } = parsePagination(
      { page, limit, sortBy, sortOrder },
      { defaultLimit: 20, maxLimit: 100, defaultSort: { createdAt: -1 }, allowedSortFields: ["createdAt","status"] }
    );
    const filter = {};
    if (status) filter.status = status;
    if (search) {
      const esc = escapeRegex(search.trim());
      const matchedUsers = await (await import("../models/user.model.js")).default.find({ $or: buildSearchOr(esc, ["name","email","phone"]) }).select("_id").lean();
      filter.$or = [
        { reason: { $regex: esc, $options: "i" } },
        ...(matchedUsers.length ? [{ userId: { $in: matchedUsers.map((u) => u._id) } }] : []),
      ];
      if (filter.$or.length === 0) {
        return res.status(200).json({ returns: [], ...buildPaginationMeta(0, p, lim) });
      }
    }
    const [returns, total] = await Promise.all([
      Return.find(filter).populate("userId", "name email phone").populate("orderId", "items totalAmount createdAt").sort(sort).skip(skip).limit(lim).lean(),
      Return.countDocuments(filter),
    ]);
    res.status(200).json({ returns, ...buildPaginationMeta(total, p, lim) });
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

    const oldStatus = returnRequest.status;
    if (status) returnRequest.status = status;
    if (refundAmount !== undefined) returnRequest.refundAmount = refundAmount;
    if (adminNotes !== undefined) returnRequest.adminNotes = adminNotes;
    if (["approved", "rejected", "completed"].includes(status) && !returnRequest.resolvedAt) {
      returnRequest.resolvedAt = new Date();
    }

    // When completing a return with a refund amount, automatically apply a credit adjustment
    // to reduce the customer's account balance. Only runs once (old status must not be "completed").
    const parsedRefund = Number(returnRequest.refundAmount);
    const isCompletingWithRefund =
      status === "completed" &&
      oldStatus !== "completed" &&
      parsedRefund > 0;

    if (isCompletingWithRefund) {
      const creditEntry = new Payment({
        userId: returnRequest.userId,
        amount: parsedRefund,
        type: "credit_adjustment",
        notes: `Refund for return request ${returnRequest._id}`,
        recordedBy: req.user._id,
        date: new Date(),
      });

      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          await returnRequest.save({ session });
          await creditEntry.save({ session });
          await User.findByIdAndUpdate(returnRequest.userId, {
            $inc: { accountBalance: -parsedRefund },
          }, { session });
        });
      } finally {
        await session.endSession();
      }

      // Async invoice sync — non-blocking
      import("../services/invoiceService.js").then(({ syncInvoiceStatusAfterPayment }) => {
        syncInvoiceStatusAfterPayment(returnRequest.userId.toString()).catch((err) => {
          console.error("[Return] Invoice sync after refund failed:", err.message);
        });
      });
    } else {
      await returnRequest.save();
    }

    res.status(200).json({ message: "Return request updated.", returnRequest });
  } catch (error) {
    console.error("Update Return Error:", error);
    res.status(500).json({ message: "Failed to update return request." });
  }
};
