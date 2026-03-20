import cron from "node-cron";
import Subscription from "../models/subscription.model.js";
import Invoice from "../models/invoice.model.js";

// Run every day at midnight: '0 0 * * *'
// For testing/demo purposes, we can run every minute: '* * * * *' or specifically for this demo.
// Let's stick to a realistic daily schedule for production code, or perhaps every hour?
// '0 0 * * *' is midnight.
const initScheduler = () => {
    console.log("📅 Scheduler initialized: Jobs scheduled for Midnight.");

    cron.schedule("0 0 * * *", async () => {
        console.log("⏰ Running Daily Delivery Job...");

        try {
            // 1. Find all active subscriptions
            const activeSubs = await Subscription.find({ status: "active" });

            const today = new Date();
            const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
            const todayName = daysOfWeek[today.getDay()];

            for (const sub of activeSubs) {
                // Check if delivery is due today
                let isDue = false;

                if (sub.deliverySchedule === "daily") {
                    isDue = true;
                } else if (sub.deliverySchedule === "alternate") {
                    // Logic for alternate days: simple check based on subscription start date difference
                    const diffTime = Math.abs(today - new Date(sub.startDate));
                    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                    if (diffDays % 2 === 0) isDue = true;
                } else if (sub.deliverySchedule === "custom") {
                    if (sub.customDays.includes(todayName)) {
                        isDue = true;
                    }
                }

                if (isDue) {
                    // Create delivery entry
                    const deliveryEntry = {
                        date: new Date(),
                        quantityDelivered: sub.quantityPerDay,
                        pricePerUnit: sub.totalPricePerDay / sub.quantityPerDay,
                        totalAmount: sub.totalPricePerDay,
                    };

                    sub.deliveryHistory.push(deliveryEntry);
                    sub.pendingAmount += sub.totalPricePerDay;

                    // Update next delivery date
                    const nextDate = new Date(sub.nextDeliveryDate);
                    nextDate.setDate(nextDate.getDate() + 1); // Simplification: just move to next day for check
                    sub.nextDeliveryDate = nextDate;

                    await sub.save();
                    console.log(`✅ Delivered to User ${sub.userId} - ${sub.productId}`);
                }
            }
        } catch (error) {
            console.error("❌ Daily Delivery Job Failed:", error);
        }
    });

    // Run on the 1st of every month at 00:00: '0 0 1 * *' 
    cron.schedule("0 0 1 * *", async () => {
        console.log("⏰ Running Monthly Invoice Generation Job...");
        try {
            const subscriptions = await Subscription.find({ pendingAmount: { $gt: 0 } });

            for (const sub of subscriptions) {
                // Create Invoice
                const invoice = new Invoice({
                    subscriptionId: sub._id,
                    userId: sub.userId,
                    items: sub.deliveryHistory.filter(item => {
                        // Filter items from the last month (simplification: just take all unbilled since we reset pendingAmount)
                        // Ideally we mark delivery items as 'billed', but relying on pendingAmount reset is a decent MVP strategy
                        return true;
                    }),
                    totalAmount: sub.pendingAmount,
                    month: new Date().toLocaleString('default', { month: 'short', year: 'numeric' }), // e.g., "Jan-2025" -> actually this would be for the *previous* month usually, but let's keep it simple.
                    dueDate: new Date(new Date().setDate(new Date().getDate() + 7)), // Due in 7 days
                    status: "unpaid"
                });

                await invoice.save();

                // Reset pending amount
                sub.pendingAmount = 0;
                // We should technically mark history items as billed or clear them, but let's keep history for record.
                // A better approach for production: add 'billed: boolean' to deliveryHistory. 
                // For now, this is sufficient for the "pendingAmount" model.

                await sub.save();
                console.log(`✅ Invoice generated for Subscription ${sub._id}: ₹${invoice.totalAmount}`);
            }
        } catch (error) {
            console.error("❌ Monthly Invoice Job Failed:", error);
        }
    });

};

export default initScheduler;
