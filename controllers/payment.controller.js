import Payment from "../models/payment.model.js";
import User from "../models/user.model.js";

export const recordPaymentAdmin = async (req, res) => {
    try {
        const { userId, amount, transactionId, notes, date } = req.body;

        if (!userId || !amount) {
            return res.status(400).json({ message: "User and amount are required." });
        }

        const payment = new Payment({
            userId,
            amount: Number(amount),
            transactionId,
            notes,
            recordedBy: req.user._id,
            date: date ? new Date(date) : new Date(),
        });

        await payment.save();

        // Atomically decrease user balance (Credit)
        await User.findByIdAndUpdate(userId, {
            $inc: { accountBalance: -Number(amount) }
        });

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

        // Revert balance (Debit)
        await User.findByIdAndUpdate(payment.userId, {
            $inc: { accountBalance: payment.amount }
        });

        await Payment.findByIdAndDelete(id);

        res.status(200).json({ message: "Payment deleted and balance reverted." });
    } catch (error) {
        console.error("Delete Payment Error:", error);
        res.status(500).json({ message: "Failed to delete payment." });
    }
};
