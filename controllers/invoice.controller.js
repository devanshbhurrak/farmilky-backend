import Invoice from "../models/invoice.model.js";

export const getMyInvoices = async (req, res) => {
    try {
        const userId = req.user._id;
        const invoices = await Invoice.find({ userId }).sort({ createdAt: -1 });

        res.status(200).json({
            count: invoices.length,
            invoices,
        });
    } catch (error) {
        console.error("Get Invoices Error:", error);
        res.status(500).json({ message: "Failed to fetch invoices" });
    }
};
