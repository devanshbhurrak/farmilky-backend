import mongoose from "mongoose";
import Payment from "../models/payment.model.js";
import User from "../models/user.model.js";

export const recordPaymentAdmin = async (req, res) => {
    try {
        const { userId, amount, transactionId, notes, date } = req.body;

        const parsedAmount = Number(amount);
        if (!userId || !amount || isNaN(parsedAmount) || parsedAmount <= 0) {
            return res.status(400).json({ message: "User and a positive amount are required." });
        }

        const payment = new Payment({
            userId,
            amount: parsedAmount,
            transactionId,
            notes,
            recordedBy: req.user._id,
            date: date ? new Date(date) : new Date(),
        });

        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                await payment.save({ session });
                await User.findByIdAndUpdate(userId, {
                    $inc: { accountBalance: -parsedAmount }
                }, { session });
            });
        } finally {
            await session.endSession();
        }

        res.status(201).json({ message: "Payment recorded successfully.", payment });
    } catch (error) {
        console.error("Record Payment Error:", error);
        res.status(500).json({ message: "Failed to record payment." });
    }
};

export const deletePaymentAdmin = async (req, res) => {
    try {
        const { id } = req.params;
        const payment = await Payment.findById(id);
        if (!payment) return res.status(404).json({ message: "Payment not found" });

        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                await User.findByIdAndUpdate(payment.userId, {
                    $inc: { accountBalance: payment.amount }
                }, { session });
                await Payment.findByIdAndDelete(id, { session });
            });
        } finally {
            await session.endSession();
        }

        res.status(200).json({ message: "Payment deleted and balance reverted." });
    } catch (error) {
        console.error("Delete Payment Error:", error);
        res.status(500).json({ message: "Failed to delete payment." });
    }
};
