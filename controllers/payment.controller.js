import mongoose from "mongoose";
import Payment from "../models/payment.model.js";
import User from "../models/user.model.js";

export const recordPaymentAdmin = async (req, res) => {
    try {
        const { userId, amount, transactionId, notes, date, type = "payment" } = req.body;
        const role = req.user?.role;

        const parsedAmount = Number(amount);
        if (!userId || !amount || isNaN(parsedAmount) || parsedAmount <= 0) {
            return res.status(400).json({ message: "User and a positive amount are required." });
        }

        const validTypes = ["payment", "credit_adjustment", "debit_adjustment"];
        if (!validTypes.includes(type)) {
            return res.status(400).json({ message: "Invalid adjustment type." });
        }

        // Delivery partners may only collect payments, not create balance adjustments.
        if (role !== "admin" && type !== "payment") {
            return res.status(403).json({ message: "Delivery partners can only record payments." });
        }

        const payment = new Payment({
            userId,
            amount: parsedAmount,
            type,
            transactionId,
            notes,
            recordedBy: req.user._id,
            date: date ? new Date(date) : new Date(),
        });

        // credit_adjustment and payment both reduce balance (give customer money / receive payment)
        // debit_adjustment increases balance (charge customer)
        const balanceDelta = type === "debit_adjustment" ? parsedAmount : -parsedAmount;

        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                await payment.save({ session });
                await User.findByIdAndUpdate(userId, {
                    $inc: { accountBalance: balanceDelta }
                }, { session });
            });
        } finally {
            await session.endSession();
        }

        const message = type === "payment" ? "Payment recorded successfully." : "Adjustment recorded successfully.";
        res.status(201).json({ message, payment });
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

        // Revert the balance change — mirror the original delta
        const revertDelta = payment.type === "debit_adjustment" ? -payment.amount : payment.amount;

        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                await User.findByIdAndUpdate(payment.userId, {
                    $inc: { accountBalance: revertDelta }
                }, { session });
                await Payment.findByIdAndDelete(id, { session });
            });
        } finally {
            await session.endSession();
        }

        res.status(200).json({ message: "Entry deleted and balance reverted." });
    } catch (error) {
        console.error("Delete Payment Error:", error);
        res.status(500).json({ message: "Failed to delete payment." });
    }
};
