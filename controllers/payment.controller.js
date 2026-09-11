import mongoose from "mongoose";
import Payment from "../models/payment.model.js";
import User from "../models/user.model.js";

export const recordPaymentAdmin = async (req, res) => {
    try {
        const { userId, amount, transactionId, notes, date, receivedDate, type = "payment" } = req.body;
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
            receivedDate: receivedDate ? new Date(receivedDate) : undefined,
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

        // Async sync — non-blocking, non-critical
        import("../services/invoiceService.js").then(({ syncInvoiceStatusAfterPayment }) => {
            syncInvoiceStatusAfterPayment(userId).catch((err) => {
                console.error("[Payment] Invoice sync failed:", err.message);
            });
        });
    } catch (error) {
        console.error("Record Payment Error:", error);
        res.status(500).json({ message: "Failed to record payment." });
    }
};

export const updatePaymentAdmin = async (req, res) => {
    try {
        const { id } = req.params;
        const { amount, type, transactionId, notes, date, receivedDate } = req.body;

        const payment = await Payment.findById(id);
        if (!payment) return res.status(404).json({ message: "Payment not found" });

        const parsedAmount = Number(amount);
        if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
            return res.status(400).json({ message: "A positive amount is required." });
        }

        const validTypes = ["payment", "credit_adjustment", "debit_adjustment"];
        if (!validTypes.includes(type)) {
            return res.status(400).json({ message: "Invalid payment type." });
        }

        // Calculate balance delta adjustment:
        // Revert the old delta, then apply the new delta
        const oldDelta = payment.type === "debit_adjustment" ? payment.amount : -payment.amount;
        const newDelta = type === "debit_adjustment" ? parsedAmount : -parsedAmount;
        const balanceAdjustment = -oldDelta + newDelta; // net change to accountBalance

        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                payment.amount = parsedAmount;
                payment.type = type;
                payment.transactionId = transactionId !== undefined ? transactionId : payment.transactionId;
                payment.notes = notes !== undefined ? notes : payment.notes;
                payment.date = date ? new Date(date) : payment.date;
                // receivedDate: null means clear, undefined means keep existing, string means update
                if (receivedDate !== undefined) {
                    payment.receivedDate = receivedDate ? new Date(receivedDate) : null;
                }
                await payment.save({ session });

                if (balanceAdjustment !== 0) {
                    await User.findByIdAndUpdate(payment.userId, {
                        $inc: { accountBalance: balanceAdjustment }
                    }, { session });
                }
            });
        } finally {
            await session.endSession();
        }

        res.status(200).json({ message: "Payment updated successfully.", payment });

        // Async invoice sync
        import("../services/invoiceService.js").then(({ syncInvoiceStatusAfterPayment }) => {
            syncInvoiceStatusAfterPayment(payment.userId.toString()).catch((err) => {
                console.error("[Payment] Invoice sync after update failed:", err.message);
            });
        });
    } catch (error) {
        console.error("Update Payment Error:", error);
        res.status(500).json({ message: "Failed to update payment." });
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

        // Async sync — recompute invoice status now that payment is gone
        const deletedUserId = payment.userId.toString();
        import("../services/invoiceService.js").then(({ syncInvoiceStatusAfterPayment }) => {
            syncInvoiceStatusAfterPayment(deletedUserId).catch((err) => {
                console.error("[Payment] Invoice sync after delete failed:", err.message);
            });
        });
    } catch (error) {
        console.error("Delete Payment Error:", error);
        res.status(500).json({ message: "Failed to delete payment." });
    }
};
