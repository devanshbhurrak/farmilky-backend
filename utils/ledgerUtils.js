import Subscription from "../models/subscription.model.js";
import Order from "../models/order.model.js";
import Payment from "../models/payment.model.js";

/**
 * Get all ledger entries for a user within an optional date range.
 * Mirrors passbook.controller.js logic — single source of truth for both.
 *
 * @param {string} userId
 * @param {{ startDate?: Date, endDate?: Date }} options
 * @returns {{ deliveryEntries, orderEntries, paymentEntries, allEntries }}
 */
export async function getLedgerEntries(userId, { startDate, endDate } = {}) {
  // Build date filter for payment/order queries
  const dateFilter = {};
  if (startDate || endDate) {
    if (startDate) dateFilter.$gte = startDate;
    if (endDate) dateFilter.$lte = endDate;
  }

  // 1. Subscriptions → Delivery line items
  const subscriptions = await Subscription.find({ userId })
    .populate("productId", "name unit variants")
    .lean();

  const deliveryEntries = [];
  subscriptions.forEach((sub) => {
    // Find the variant to get its actual volume/quantity value (e.g., 0.5 for "0.5L")
    const variant = sub.variantId
      ? sub.productId?.variants?.find(
          (v) => v._id.toString() === sub.variantId.toString()
        )
      : null;
    // variantVolume: how many base units (L, kg, etc.) each ordered "unit" represents
    // e.g., for a "0.5L" variant, variantVolume = 0.5
    const variantVolume = variant?.quantity ?? 1;

    (sub.deliveryHistory || []).forEach((entry) => {
      if (!["delivered", "extra", "partial"].includes(entry.status)) return;
      const entryDate = new Date(entry.deliveryDate || entry.date);
      if (startDate && entryDate < startDate) return;
      if (endDate && entryDate > endDate) return;

      // deliveredUnits: number of bottles/packets delivered
      const deliveredUnits =
        entry.actualQuantity ?? entry.quantityDelivered ?? entry.scheduledQuantity;
      // actualVolume: real quantity in the product's base unit (L, kg, etc.)
      const actualVolume =
        variantVolume !== 1
          ? Math.round(deliveredUnits * variantVolume * 1000) / 1000
          : deliveredUnits;
      // pricePerBaseUnit: e.g., ₹25/bottle ÷ 0.5L = ₹50/L
      const pricePerBaseUnit =
        entry.pricePerUnit != null && variantVolume !== 1
          ? Math.round((entry.pricePerUnit / variantVolume) * 100) / 100
          : entry.pricePerUnit;

      deliveryEntries.push({
        date: entryDate,
        type: "debit",
        entryType: "debit",
        amount: entry.totalAmount || 0,
        description: `${sub.productId?.name || "Product"} Delivery`,
        category: "Subscription",
        referenceId: sub._id,
        referenceModel: "Subscription",
        productId: sub.productId?._id,
        productName: sub.productId?.name,
        variantLabel: sub.variantLabel,
        unit: sub.variantUnit || sub.productId?.unit,
        quantity: actualVolume,
        unitPrice: pricePerBaseUnit,
        status: entry.status,
        notes: entry.notes,
      });
    });
  });

  // 2. Orders → Debit entries (and reversal credits)
  const orderQuery = { userId };
  if (startDate || endDate) {
    // Filter by deliveredAt when date range is specified
    const deliveredAtFilter = {};
    if (startDate) deliveredAtFilter.$gte = startDate;
    if (endDate) deliveredAtFilter.$lte = endDate;
    orderQuery.$or = [
      { deliveredAt: Object.keys(deliveredAtFilter).length ? deliveredAtFilter : { $ne: null } },
    ];
  } else {
    orderQuery.$or = [{ orderStatus: "delivered" }, { deliveredAt: { $ne: null } }];
  }

  const orders = await Order.find(orderQuery).lean();
  const orderEntries = [];
  orders.forEach((order) => {
    const delivDate = new Date(order.deliveredAt || order.createdAt);
    if (startDate && delivDate < startDate) return;
    if (endDate && delivDate > endDate) return;

    orderEntries.push({
      date: delivDate,
      type: "debit",
      entryType: "debit",
      amount: order.totalAmount || 0,
      description: `Order #${order._id.toString().slice(-6).toUpperCase()}`,
      category: "Order",
      referenceId: order._id,
      referenceModel: "Order",
      quantity: 1,
      unitPrice: order.totalAmount,
      notes: order.items?.map((i) => `${i.name} x${i.quantity}`).join(", "),
    });

    // If order was later reversed (cancelled after delivery)
    if (order.deliveredAt && order.orderStatus !== "delivered") {
      const reversalDate = new Date(order.cancelledAt || order.updatedAt || order.deliveredAt);
      if ((!startDate || reversalDate >= startDate) && (!endDate || reversalDate <= endDate)) {
        orderEntries.push({
          date: reversalDate,
          type: "credit",
          entryType: "credit",
          amount: order.totalAmount || 0,
          description: `Order #${order._id.toString().slice(-6).toUpperCase()} Reversed`,
          category: "Order",
          referenceId: order._id,
          referenceModel: "Order",
          quantity: 1,
          unitPrice: order.totalAmount,
          notes: `Status changed to ${order.orderStatus}`,
        });
      }
    }
  });

  // 3. Payments & Adjustments
  const paymentQuery = { userId };
  if (startDate || endDate) {
    paymentQuery.date = {};
    if (startDate) paymentQuery.date.$gte = startDate;
    if (endDate) paymentQuery.date.$lte = endDate;
  }

  const payments = await Payment.find(paymentQuery).lean();
  const paymentEntries = payments.map((pay) => {
    const isDebitAdj = pay.type === "debit_adjustment";
    const isAdjustment = pay.type === "credit_adjustment" || pay.type === "debit_adjustment";
    return {
      date: new Date(pay.date),
      type: isDebitAdj ? "debit" : "credit",
      entryType: isDebitAdj ? "debit" : "credit",
      amount: pay.amount,
      description: isDebitAdj ? "Manual Debit" : isAdjustment ? "Manual Credit" : "Payment Received",
      category: isAdjustment ? "Adjustment" : "Payment",
      referenceId: pay._id,
      referenceModel: "Payment",
      paymentType: pay.type,
      notes: pay.notes || pay.transactionId || "",
    };
  });

  const allEntries = [...deliveryEntries, ...orderEntries, ...paymentEntries].sort(
    (a, b) => new Date(a.date) - new Date(b.date)
  );

  return { deliveryEntries, orderEntries, paymentEntries, allEntries };
}
