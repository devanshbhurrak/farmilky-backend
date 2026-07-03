import mongoose from "mongoose";
import Product from "../models/product.model.js";
import Subscription from "../models/subscription.model.js";
import Order from "../models/order.model.js";
import User from "../models/user.model.js";

import { calculateNextDeliveryDate, isSubscriptionDueOnDate } from "../services/scheduler.js";

const normalizeDay = (value) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

const getDeliveryEntryDate = (entry) => entry.deliveryDate || entry.date;

const normalizeDeliveryOutcome = (entry, subscription) => {
  if (!entry) return null;
  const raw = typeof entry.toObject === "function" ? entry.toObject() : entry;
  return {
    ...raw,
    deliveryDate: getDeliveryEntryDate(entry),
    status: entry.status || "delivered",
    scheduledQuantity: entry.scheduledQuantity ?? subscription.quantityPerDay,
    actualQuantity: entry.actualQuantity ?? entry.quantityDelivered ?? subscription.quantityPerDay,
  };
};

export const createSubscriptionAdmin = async (req, res) => {
  try {
    const { userId, productId, deliverySchedule = "daily", customDays = [] } = req.body;
    const parsedQuantityPerDay = Number.parseInt(req.body.quantityPerDay ?? req.body.quantity, 10);

    if (!userId || !productId || !Number.isInteger(parsedQuantityPerDay) || parsedQuantityPerDay < 1) {
      return res.status(400).json({ message: "User, product, and valid quantity required" });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    let adminResolvedVariantId = null;
    let adminResolvedVariantLabel = null;
    let adminResolvedVariantUnit = null;
    const explicitPrice = req.body.pricePerUnit != null && Number(req.body.pricePerUnit) > 0;
    let pricePerUnit = explicitPrice ? Number(req.body.pricePerUnit) : product.price;

    if (product.variants?.length > 0 && !explicitPrice) {
        const variantId = req.body.variantId;
        let variant;
        if (variantId) {
            variant = product.variants.id(variantId);
            if (!variant) return res.status(400).json({ message: "Variant not found" });
        } else {
            variant = product.variants.find(v => v.isDefault) || product.variants[0];
        }
        pricePerUnit = variant.discountedPrice ?? variant.price;
        adminResolvedVariantId = variant._id;
        adminResolvedVariantLabel = variant.label;
        adminResolvedVariantUnit = variant.unit || null;
    }

    const totalPricePerDay = parseFloat((pricePerUnit * parsedQuantityPerDay).toFixed(2));

    let startDate = new Date();
    if (req.body.startDate) {
      const parsed = new Date(req.body.startDate);
      if (!Number.isNaN(parsed.getTime())) {
        startDate = parsed;
      }
    }
    startDate.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const nextDeliveryDate =
      startDate.getTime() > today.getTime()
        ? startDate
        : calculateNextDeliveryDate({ deliverySchedule, customDays }, startDate);

    const subscription = new Subscription({
      userId,
      productId,
      quantityPerDay: parsedQuantityPerDay,
      deliverySchedule,
      customDays: deliverySchedule === "custom" ? customDays : [],
      pricePerUnit,
      totalPricePerDay,
      nextDeliveryDate,
      status: req.body.status || "active",
      startDate,
      pendingAmount: 0,
      deliveryHistory: [],
      variantId: adminResolvedVariantId,
      variantLabel: adminResolvedVariantLabel,
      variantUnit: adminResolvedVariantUnit,
    });

    await subscription.save();

    res.status(201).json({
      message: "Subscription created successfully by admin",
      subscription,
    });
  } catch (error) {
    console.error("Create Subscription Admin Error:", error);
    res.status(500).json({ message: "Failed to create subscription" });
  }
};

export const createSubscription = async (req, res) => {
  try {
    const userId = req.user._id;
    const { productId, deliverySchedule = "daily", customDays = [] } =
      req.body;
    const parsedQuantityPerDay = Number.parseInt(
      req.body.quantityPerDay ?? req.body.quantity,
      10
    );

    if (!productId || !Number.isInteger(parsedQuantityPerDay) || parsedQuantityPerDay < 1) {
      return res.status(400).json({ message: "Valid product and quantity required" });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // 1️⃣ Calculate price (customers always pay product price — custom rates are admin-only)
    let pricePerUnit = product.price;
    let resolvedVariantId = null;
    let resolvedVariantLabel = null;
    let resolvedVariantUnit = null;

    if (product.variants?.length > 0) {
        const variantId = req.body.variantId;
        let variant;
        if (variantId) {
            variant = product.variants.id(variantId);
            if (!variant) return res.status(400).json({ message: "Variant not found" });
        } else {
            variant = product.variants.find(v => v.isDefault) || product.variants[0];
        }
        pricePerUnit = variant.discountedPrice ?? variant.price;
        resolvedVariantId = variant._id;
        resolvedVariantLabel = variant.label;
        resolvedVariantUnit = variant.unit || null;
    }

    const totalPricePerDay = parseFloat((pricePerUnit * parsedQuantityPerDay).toFixed(2));

    // 2️⃣ Calculate next delivery date
    if (deliverySchedule === "custom") {
      if (!customDays.length) {
        return res
          .status(400)
          .json({ message: "Custom days required for custom schedule" });
      }
    }

    let startDate = new Date();
    if (req.body.startDate) {
      const parsed = new Date(req.body.startDate);
      if (!Number.isNaN(parsed.getTime()) && parsed > new Date()) {
        startDate = parsed;
      }
    }
    startDate.setHours(0, 0, 0, 0);

    // If start date is in the future, first delivery is ON that date
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const nextDeliveryDate =
      startDate.getTime() > today.getTime()
        ? startDate
        : calculateNextDeliveryDate({ deliverySchedule, customDays }, startDate);

    // 3️⃣ Create subscription
    const subscription = new Subscription({
      userId,
      productId,
      quantityPerDay: parsedQuantityPerDay,
      deliverySchedule,
      customDays: deliverySchedule === "custom" ? customDays : [],
      pricePerUnit,
      totalPricePerDay,
      nextDeliveryDate,
      status: "active",
      startDate,
      pendingAmount: 0,
      deliveryHistory: [],
      variantId: resolvedVariantId,
      variantLabel: resolvedVariantLabel,
      variantUnit: resolvedVariantUnit,
    });

    await subscription.save();

    res.status(201).json({
      message: "Subscription created successfully",
      subscription,
    });
  } catch (error) {
    console.error("Create Subscription Error:", error);
    res.status(500).json({ message: "Failed to create subscription" });
  }
};


export const getUserSubscription = async (req, res) => {
    try {
        const userId = req.user._id

        const subs = await Subscription.find({userId})
            .populate('productId');

        res.status(200).json({
            count: subs.length,
            subscription: subs
        })
    } catch (error) {
        console.error("Get Subscriptions Error:", error);
        res.status(500).json({ message: "Failed to fetch subscriptions." });
    }
}

export const pauseSubscription = async (req, res) => {
    try {
        const userId = req.user._id;
        const {id} = req.params
        
        const sub = await Subscription.findOne({ _id: id, userId });

        if(!sub) return res.status(404).json({message: 'Subscription not found'});

        sub.status = 'paused'
        await sub.save()

        res.status(200).json({message: 'Subscription paused', subscription: sub})
    } catch (error) {
        console.error('Pause Subscription Error:', error);
        res.status(500).json({message: 'Failed to pause subscription'})
    }
}

export const resumeSubscription = async (req, res) => {
    try {
        const userId = req.user._id;
        const {id} = req.params

        const sub = await Subscription.findOne({ _id: id, userId });

        if(!sub) return res.status(404).json({message: 'Subscription not found'});

        sub.status = 'active'
        await sub.save();

        res.status(200).json({message: 'Subscription resumed', subscription: sub});
    } catch (error) {
        console.error('Resume Subscriptin Error:', error);
        res.status(500).json({message: 'Failed to resume subscription'})
    }
}

export const cancelSubscription = async (req, res) => {
    try {
        const userId = req.user._id;
        const {id} = req.params

        const sub = await Subscription.findOne({ _id: id, userId });

        if(!sub) return res.status(404).json({message: "Subscription not found"})

        sub.status = "cancelled";
        await sub.save();

        res.status(200).json({message: 'Subscription cancelled'})
    } catch (error) {
        console.error("Cancel Subscription Error:", error);
        res.status(500).json({ message: "Failed to cancel subscription." })
    }
}

export const getSubscriptionById = async (req, res) => {
    try {
        const userId = req.user._id;
        const { id } = req.params;

        const subscription = await Subscription.findOne({ _id: id, userId })
            .populate('productId');

        if (!subscription) {
            return res.status(404).json({ message: "Subscription not found" });
        }

        res.status(200).json({ subscription });
    } catch (error) {
        console.error("Get Subscription By Id Error:", error);
        res.status(500).json({ message: "Failed to fetch subscription." });
    }
}

export const getAllSubscriptions = async (req, res) => {
    try {
        const subscriptions = await Subscription.find()
            .populate("userId", "name email phone")
            .populate("productId", "name unit image price category")
            .sort({ createdAt: -1 });

        res.status(200).json({
            count: subscriptions.length,
            subscriptions,
        });
    } catch (error) {
        console.error("Get All Subscriptions Error:", error);
        res.status(500).json({ message: "Failed to fetch subscriptions." });
    }
}

export const updateSubscriptionStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const validStatuses = ["active", "paused", "cancelled"];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ message: "Invalid subscription status" });
        }

        const subscription = await Subscription.findById(id)
            .populate("userId", "name email phone")
            .populate("productId", "name unit image price category");

        if (!subscription) {
            return res.status(404).json({ message: "Subscription not found" });
        }

        subscription.status = status;
        await subscription.save();

        res.status(200).json({
            message: "Subscription status updated successfully",
            subscription,
        });
    } catch (error) {
        console.error("Update Subscription Status Error:", error);
        res.status(500).json({ message: "Failed to update subscription status." });
    }
}

export const getTodaySupply = async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const subscriptions = await Subscription.find({ status: "active" })
            .populate("userId", "name email phone")
            .populate("productId", "name unit image price category");

        const dueSubscriptions = subscriptions.filter((subscription) =>
            isSubscriptionDueOnDate(subscription, today)
        );

        const supplies = dueSubscriptions.map((subscription) => ({
            subscriptionId: subscription._id,
            user: subscription.userId,
            product: subscription.productId,
            quantity: subscription.quantityPerDay,
            unit: subscription.productId?.unit || "unit",
            totalAmount: subscription.totalPricePerDay,
            deliverySchedule: subscription.deliverySchedule,
            customDays: subscription.customDays,
            nextDeliveryDate: subscription.nextDeliveryDate,
            pendingAmount: subscription.pendingAmount,
        }));

        const byProductMap = new Map();

        for (const supply of supplies) {
            const productId = String(supply.product?._id || supply.subscriptionId);
            const existing = byProductMap.get(productId) || {
                productId,
                name: supply.product?.name || "Unknown Product",
                unit: supply.unit,
                totalQuantity: 0,
                totalAmount: 0,
                customerCount: 0,
            };

            existing.totalQuantity += supply.quantity;
            existing.totalAmount += supply.totalAmount;
            existing.customerCount += 1;

            byProductMap.set(productId, existing);
        }

        res.status(200).json({
            date: today,
            summary: {
                totalSubscriptionsDue: supplies.length,
                totalQuantity: supplies.reduce((sum, item) => sum + item.quantity, 0),
                totalAmount: supplies.reduce((sum, item) => sum + item.totalAmount, 0),
                byProduct: Array.from(byProductMap.values()).sort((a, b) => b.totalQuantity - a.totalQuantity),
            },
            supplies,
        });
    } catch (error) {
        console.error("Get Today Supply Error:", error);
        res.status(500).json({ message: "Failed to fetch today's supply." });
    }
}

export const getDeliveryBoard = async (req, res) => {
    try {
        const targetDate = req.query.date ? new Date(req.query.date) : new Date();
        targetDate.setHours(0, 0, 0, 0);
        const nextDate = new Date(targetDate);
        nextDate.setDate(nextDate.getDate() + 1);

        const type = req.query.type || "all";
        const status = req.query.status || "all";

        const [subscriptions, relevantOrders] = await Promise.all([
            Subscription.find({
                $or: [
                    { status: "active" },
                    { "deliveryHistory.deliveryDate": { $gte: targetDate, $lt: nextDate } },
                    { "deliveryHistory.date": { $gte: targetDate, $lt: nextDate } },
                ],
            })
                .populate("userId", "name email phone")
                .populate("productId", "name unit image price category"),
            Order.find({
                $or: [
                    { orderStatus: { $in: ["placed", "confirmed"] } },
                    { orderStatus: "delivered", deliveredAt: { $gte: targetDate, $lt: nextDate } },
                ],
            })
                .populate("userId", "name email phone")
                .sort({ createdAt: -1 }),
        ]);

        const subscriptionDeliveries = subscriptions
            .map((subscription) => {
                const todayEntry = subscription.deliveryHistory.find((entry) => {
                    const entryDate = getDeliveryEntryDate(entry);
                    if (!entryDate) return false;
                    const d = normalizeDay(entryDate);
                    return d.getTime() === targetDate.getTime();
                });
                const dueToday = isSubscriptionDueOnDate(subscription, targetDate);
                const normalizedOutcome = normalizeDeliveryOutcome(todayEntry, subscription);

                if (!dueToday && !todayEntry) return null;

                const effectiveUnit = subscription.variantUnit || subscription.productId?.unit || "unit";
                const productName = subscription.productId?.name || "Unknown Product";
                const label = subscription.variantLabel
                    ? `${productName} (${subscription.variantLabel})`
                    : productName;

                return {
                    id: String(subscription._id),
                    type: "subscription",
                    customerName: subscription.userId?.name || "Unknown Customer",
                    phone: subscription.userId?.phone || "",
                    email: subscription.userId?.email || "",
                    address: null,
                    productLabel: label,
                    quantity: subscription.quantityPerDay,
                    unit: effectiveUnit,
                    amount: subscription.totalPricePerDay || 0,
                    schedule: subscription.deliverySchedule,
                    status: subscription.status,
                    deliveryStatus: normalizedOutcome ? normalizedOutcome.status : "pending",
                    outcome: normalizedOutcome,
                    canRecordOutcome: dueToday && !todayEntry,
                    scheduledQuantity: subscription.quantityPerDay,
                    pendingAmount: subscription.pendingAmount || 0,
                    createdAt: subscription.createdAt,
                };
            })
            .filter(Boolean);

        const orderDeliveries = relevantOrders.map((order) => {
            const attemptsToday = (order.deliveryAttempts || []).filter((attempt) => {
                if (!attempt.attemptDate) return false;
                const attemptDate = normalizeDay(attempt.attemptDate);
                return attemptDate.getTime() === targetDate.getTime();
            });
            const latestAttemptToday = attemptsToday.at(-1) || null;
            const deliveryStatus = order.orderStatus === "delivered" ? "delivered"
                : latestAttemptToday?.status === "failed" ? "failed"
                : "pending";

            return {
                id: String(order._id),
                type: "order",
                customerName: order.userId?.name || "Unknown Customer",
                phone: order.userId?.phone || "",
                email: order.userId?.email || "",
                address: order.address
                    ? `${order.address.street}, ${order.address.city}, ${order.address.state} - ${order.address.pincode}`
                    : "Address not available",
                productLabel: `${order.items.length} item(s)`,
                quantity: order.items.reduce((sum, item) => sum + (item.quantity || 0), 0),
                unit: "items",
                amount: order.totalAmount || 0,
                schedule: "one-time",
                status: order.orderStatus,
                deliveryStatus,
                outcome: latestAttemptToday,
                canRecordOutcome: order.orderStatus !== "delivered" && !latestAttemptToday,
                scheduledQuantity: order.items.reduce((s, i) => s + i.quantity, 0),
                pendingAmount: order.paymentStatus === "pending" ? order.totalAmount || 0 : 0,
                createdAt: order.createdAt,
            };
        });

        let allDeliveries = [...subscriptionDeliveries, ...orderDeliveries].filter(Boolean);

        if (type !== "all") {
            allDeliveries = allDeliveries.filter(d => d.type === type);
        }
        if (status !== "all") {
            allDeliveries = allDeliveries.filter(d => d.deliveryStatus === status);
        }

        const subDeliveries = allDeliveries.filter(d => d.type === "subscription");
        const orderDeliveriesFiltered = allDeliveries.filter(d => d.type === "order");

        allDeliveries.sort((a, b) => {
            if (a.canRecordOutcome !== b.canRecordOutcome) {
                return a.canRecordOutcome ? -1 : 1;
            }
            if (a.type !== b.type) {
                return a.type === "subscription" ? -1 : 1;
            }
            return a.customerName.localeCompare(b.customerName);
        });

        res.status(200).json({
            date: targetDate,
            summary: {
                totalDeliveries: allDeliveries.length,
                subscriptionDeliveries: subDeliveries.length,
                orderDeliveries: orderDeliveriesFiltered.length,
                remainingDeliveries: allDeliveries.filter((item) => item.canRecordOutcome).length,
                completedDeliveries: allDeliveries.filter((item) => item.deliveryStatus === "delivered").length,
                exceptions: allDeliveries.filter((item) => ["skipped","partial","extra","failed"].includes(item.deliveryStatus)).length,
                totalAmount: allDeliveries.reduce((sum, item) => sum + item.amount, 0),
            },
            deliveries: allDeliveries,
        });
    } catch (error) {
        console.error("Get Delivery Board Error:", error);
        res.status(500).json({ message: "Failed to fetch delivery board." });
    }
}

export const getSubscriptionByIdAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const subscription = await Subscription.findById(id)
      .populate("userId", "name email phone")
      .populate("productId", "name unit image price category");

    if (!subscription) {
      return res.status(404).json({ message: "Subscription not found" });
    }

    res.status(200).json({ subscription });
  } catch (error) {
    console.error("Get Subscription By Id Admin Error:", error);
    res.status(500).json({ message: "Failed to fetch subscription." });
  }
};

export const recordSubscriptionDeliveryOutcome = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, actualQuantity, reason, notes, deliveryDate } = req.body;

    const validStatuses = ["delivered", "skipped", "partial", "extra", "failed"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: `Invalid status. Must be one of: ${validStatuses.join(", ")}` });
    }

    const subscription = await Subscription.findById(id)
      .populate("userId", "name email phone")
      .populate("productId", "name unit image price category");

    if (!subscription) {
      return res.status(404).json({ message: "Subscription not found" });
    }

    const targetDate = deliveryDate ? new Date(deliveryDate) : new Date();
    targetDate.setHours(0, 0, 0, 0);

    // Check if an outcome for this date already exists to handle updates/corrections
    const existingEntryIndex = subscription.deliveryHistory.findIndex((entry) => {
      const entryDate = getDeliveryEntryDate(entry);
      if (!entryDate) return false;
      const d = normalizeDay(entryDate);
      return d.getTime() === targetDate.getTime();
    });

    const pricePerUnit = parseFloat((subscription.totalPricePerDay / subscription.quantityPerDay).toFixed(2));
    const scheduledQuantity = subscription.quantityPerDay;

    let finalActualQuantity;
    let finalTotalAmount;

    if (status === "delivered") {
      finalActualQuantity = scheduledQuantity;
      finalTotalAmount = subscription.totalPricePerDay; // Use exact daily total to avoid rounding drift
    } else if (status === "partial" || status === "extra") {
      if (actualQuantity == null || Number(actualQuantity) <= 0) {
        return res.status(400).json({ message: "actualQuantity is required and must be a positive number for partial/extra." });
      }
      finalActualQuantity = Number(actualQuantity);
      finalTotalAmount = parseFloat((finalActualQuantity * pricePerUnit).toFixed(2));
    } else {
      finalActualQuantity = 0;
      finalTotalAmount = 0;
    }

    if ((status === "skipped" || status === "failed") && !reason) {
      return res.status(400).json({ message: "A reason is required for skipped or failed deliveries." });
    }

    const deliveryEntry = {
      deliveryDate: targetDate,
      status,
      scheduledQuantity,
      actualQuantity: finalActualQuantity,
      pricePerUnit,
      totalAmount: finalTotalAmount,
      reason: reason || null,
      notes: notes || null,
      handledBy: req.user?._id || null,
      handledAt: new Date(),
    };

    let balanceAdjustment = finalTotalAmount;

    if (existingEntryIndex !== -1) {
        // Handle Correction: Subtract old amount, add new amount
        const oldEntry = subscription.deliveryHistory[existingEntryIndex];
        balanceAdjustment = finalTotalAmount - (oldEntry.totalAmount || 0);
        
        subscription.deliveryHistory[existingEntryIndex] = deliveryEntry;
        subscription.pendingAmount += balanceAdjustment;
    } else {
        // New Entry
        if (!isSubscriptionDueOnDate(subscription, targetDate)) {
            return res.status(400).json({ message: "This subscription is not due for delivery on this date." });
        }
        subscription.deliveryHistory.push(deliveryEntry);
        subscription.pendingAmount += finalTotalAmount;
        subscription.nextDeliveryDate = calculateNextDeliveryDate(subscription, targetDate);
    }

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await subscription.save({ session });
        if (balanceAdjustment !== 0) {
          await User.findByIdAndUpdate(subscription.userId, {
            $inc: { accountBalance: balanceAdjustment }
          }, { session });
        }
      });
    } finally {
      await session.endSession();
    }

    return res.status(200).json({
      message: existingEntryIndex !== -1 ? "Delivery outcome updated." : `Delivery outcome recorded as ${status}.`,
      subscription,
      adjustment: balanceAdjustment,
      pendingAmount: subscription.pendingAmount,
    });
  } catch (error) {
    console.error("Record Subscription Delivery Outcome Error:", error);
    return res.status(500).json({ message: "Failed to record delivery outcome." });
  }
};

export const markSubscriptionDeliveredToday = async (req, res) => {
    try {
        const { id } = req.params;
        const subscription = await Subscription.findById(id)
            .populate("userId", "name email phone")
            .populate("productId", "name unit image price category");

        if (!subscription) {
            return res.status(404).json({ message: "Subscription not found" });
        }

        if (subscription.status !== "active") {
            return res.status(400).json({ message: "Only active subscriptions can be delivered." });
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (!isSubscriptionDueOnDate(subscription, today)) {
            return res.status(400).json({ message: "This subscription is not due for delivery today." });
        }

        const alreadyDeliveredToday = subscription.deliveryHistory.some((entry) => {
            const entryDateValue = getDeliveryEntryDate(entry);
            if (!entryDateValue) return false;
            const entryDate = normalizeDay(entryDateValue);
            return entryDate.getTime() === today.getTime();
        });

        if (alreadyDeliveredToday) {
            return res.status(400).json({ message: "This subscription is already marked delivered today." });
        }

        const entryPricePerUnit = parseFloat((subscription.totalPricePerDay / subscription.quantityPerDay).toFixed(2));
        const entryTotalAmount = subscription.totalPricePerDay; // Use exact daily total to avoid rounding drift
        const deliveryEntry = {
            deliveryDate: new Date(),
            status: "delivered",
            scheduledQuantity: subscription.quantityPerDay,
            actualQuantity: subscription.quantityPerDay,
            pricePerUnit: entryPricePerUnit,
            totalAmount: entryTotalAmount,
        };

        subscription.deliveryHistory.push(deliveryEntry);
        subscription.pendingAmount += entryTotalAmount;
        subscription.nextDeliveryDate = calculateNextDeliveryDate(subscription, today);

        const session = await mongoose.startSession();
        try {
          await session.withTransaction(async () => {
            await subscription.save({ session });
            await User.findByIdAndUpdate(subscription.userId, {
              $inc: { accountBalance: entryTotalAmount }
            }, { session });
          });
        } finally {
          await session.endSession();
        }

        return res.status(200).json({
            message: "Subscription delivery marked for today.",
            subscription,
            addedAmount: deliveryEntry.totalAmount,
            pendingAmount: subscription.pendingAmount,
        });
    } catch (error) {
        console.error("Mark Subscription Delivered Error:", error);
        return res.status(500).json({ message: "Failed to mark subscription delivery." });
    }
};

export const updateSubscriptionAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { quantityPerDay, deliverySchedule, customDays, status, productId, startDate } = req.body;

    const sub = await Subscription.findById(id).populate("productId");
    if (!sub) return res.status(404).json({ message: "Subscription not found" });

    const productChanged = productId && String(productId) !== String(sub.productId?._id || sub.productId);
    if (productId) sub.productId = productId;
    if (status) sub.status = status;
    if (startDate) sub.startDate = new Date(startDate);

    if (deliverySchedule) {
      const valid = ["daily", "alternate", "weekly", "custom"];
      if (!valid.includes(deliverySchedule)) return res.status(400).json({ message: "Invalid delivery schedule" });
      if (deliverySchedule === "custom" && (!customDays || !customDays.length)) {
        return res.status(400).json({ message: "Custom days required for custom schedule" });
      }
      sub.deliverySchedule = deliverySchedule;
      sub.customDays = deliverySchedule === "custom" ? customDays : [];
    }

    if (quantityPerDay != null) {
      const qty = Number.parseInt(quantityPerDay, 10);
      if (!Number.isInteger(qty) || qty < 1) return res.status(400).json({ message: "Invalid quantity" });
      sub.quantityPerDay = qty;
    }

    // Resolve the effective price per unit:
    // 1. If a new pricePerUnit is explicitly provided in this request → use it
    // 2. If the product changed (and no explicit price) → reset to new product's price
    // 3. Otherwise → keep the existing sub.pricePerUnit (custom rate is preserved)
    // sub.productId may be a populated document or a plain ObjectId — normalise to ID
    const product = await Product.findById(sub.productId?._id || sub.productId);
    if (!product) return res.status(404).json({ message: "Product not found" });

    if (req.body.pricePerUnit != null && Number(req.body.pricePerUnit) > 0) {
      sub.pricePerUnit = Number(req.body.pricePerUnit);
    } else if (productChanged) {
      sub.pricePerUnit = product.price;
    }
    // else: keep existing sub.pricePerUnit

    const effectivePricePerUnit = sub.pricePerUnit || product.price;
    sub.totalPricePerDay = parseFloat((effectivePricePerUnit * sub.quantityPerDay).toFixed(2));

    // Recalculate next delivery date
    sub.nextDeliveryDate = calculateNextDeliveryDate(sub, new Date());

    await sub.save();
    res.status(200).json({ message: "Subscription updated successfully by admin", subscription: sub });
  } catch (error) {
    console.error("Update Subscription Admin Error:", error);
    res.status(500).json({ message: "Failed to update subscription" });
  }
};

export const updateSubscription = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;
    const { quantityPerDay, deliverySchedule, customDays } = req.body;

    const sub = await Subscription.findOne({ _id: id, userId }).populate("productId");
    if (!sub) return res.status(404).json({ message: "Subscription not found" });
    if (sub.status === "cancelled") return res.status(400).json({ message: "Cannot modify a cancelled subscription" });

    if (deliverySchedule) {
      const valid = ["daily", "alternate", "weekly", "custom"];
      if (!valid.includes(deliverySchedule)) return res.status(400).json({ message: "Invalid delivery schedule" });
      if (deliverySchedule === "custom" && (!customDays || !customDays.length)) {
        return res.status(400).json({ message: "Custom days required for custom schedule" });
      }
      sub.deliverySchedule = deliverySchedule;
      sub.customDays = deliverySchedule === "custom" ? customDays : [];
      sub.nextDeliveryDate = calculateNextDeliveryDate(sub, new Date());
    }

    if (quantityPerDay) {
      const qty = Number.parseInt(quantityPerDay, 10);
      if (!Number.isInteger(qty) || qty < 1) return res.status(400).json({ message: "Invalid quantity" });
      sub.quantityPerDay = qty;
      // Use the stored pricePerUnit (custom negotiated rate) — falls back to product price for legacy records
      const effectivePricePerUnit = sub.pricePerUnit || sub.productId.price;
      sub.totalPricePerDay = parseFloat((effectivePricePerUnit * qty).toFixed(2));
    }

    await sub.save();
    res.status(200).json({ message: "Subscription updated", subscription: sub });
  } catch (error) {
    console.error("Update Subscription Error:", error);
    res.status(500).json({ message: "Failed to update subscription" });
  }
};

export const scheduleQuantityChange = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;
    const { newQuantityPerDay, effectiveDate } = req.body;

    if (!newQuantityPerDay || !effectiveDate) {
      return res.status(400).json({ message: "newQuantityPerDay and effectiveDate are required" });
    }

    const qty = Number.parseInt(newQuantityPerDay, 10);
    if (!Number.isInteger(qty) || qty < 1) return res.status(400).json({ message: "Invalid quantity" });

    const effDate = new Date(effectiveDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (Number.isNaN(effDate.getTime()) || effDate <= today) {
      return res.status(400).json({ message: "Effective date must be in the future" });
    }

    const sub = await Subscription.findOne({ _id: id, userId });
    if (!sub) return res.status(404).json({ message: "Subscription not found" });
    if (sub.status === "cancelled") return res.status(400).json({ message: "Cannot modify a cancelled subscription" });

    sub.scheduledChange = { newQuantityPerDay: qty, effectiveDate: effDate };
    await sub.save();

    res.status(200).json({ message: "Quantity change scheduled", subscription: sub });
  } catch (error) {
    console.error("Schedule Quantity Change Error:", error);
    res.status(500).json({ message: "Failed to schedule quantity change" });
  }
};

export const cancelScheduledChange = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;

    const sub = await Subscription.findOne({ _id: id, userId });
    if (!sub) return res.status(404).json({ message: "Subscription not found" });

    sub.scheduledChange = { newQuantityPerDay: null, effectiveDate: null };
    await sub.save();

    res.status(200).json({ message: "Scheduled change cancelled", subscription: sub });
  } catch (error) {
    console.error("Cancel Scheduled Change Error:", error);
    res.status(500).json({ message: "Failed to cancel scheduled change" });
  }
};

export const scheduleVacation = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;
    const { pauseFrom, pauseUntil } = req.body;

    if (!pauseFrom || !pauseUntil) {
      return res.status(400).json({ message: "pauseFrom and pauseUntil are required" });
    }

    const from = new Date(pauseFrom);
    const until = new Date(pauseUntil);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (Number.isNaN(from.getTime()) || Number.isNaN(until.getTime())) {
      return res.status(400).json({ message: "Invalid dates provided" });
    }
    if (from >= until) return res.status(400).json({ message: "pauseFrom must be before pauseUntil" });
    if (from < today) return res.status(400).json({ message: "pauseFrom cannot be in the past" });

    const sub = await Subscription.findOne({ _id: id, userId });
    if (!sub) return res.status(404).json({ message: "Subscription not found" });
    if (sub.status === "cancelled") return res.status(400).json({ message: "Cannot schedule vacation on a cancelled subscription" });

    sub.vacationSchedule = { pauseFrom: from, pauseUntil: until };
    await sub.save();

    res.status(200).json({ message: "Vacation scheduled", subscription: sub });
  } catch (error) {
    console.error("Schedule Vacation Error:", error);
    res.status(500).json({ message: "Failed to schedule vacation" });
  }
};

export const cancelVacation = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;

    const sub = await Subscription.findOne({ _id: id, userId });
    if (!sub) return res.status(404).json({ message: "Subscription not found" });

    sub.vacationSchedule = { pauseFrom: null, pauseUntil: null };
    await sub.save();

    res.status(200).json({ message: "Vacation cancelled", subscription: sub });
  } catch (error) {
    console.error("Cancel Vacation Error:", error);
    res.status(500).json({ message: "Failed to cancel vacation" });
  }
};

export const skipDeliveryDate = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;
    const { date } = req.body;

    if (!date) return res.status(400).json({ message: "date is required" });

    const skipDate = new Date(date);
    skipDate.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (Number.isNaN(skipDate.getTime())) return res.status(400).json({ message: "Invalid date" });
    if (skipDate < today) return res.status(400).json({ message: "Cannot skip a past date" });

    const sub = await Subscription.findOne({ _id: id, userId });
    if (!sub) return res.status(404).json({ message: "Subscription not found" });
    if (sub.status !== "active") return res.status(400).json({ message: "Only active subscriptions can have dates skipped" });

    const alreadySkipped = sub.skippedDates.some(
      (d) => new Date(d).setHours(0, 0, 0, 0) === skipDate.getTime()
    );
    if (alreadySkipped) return res.status(409).json({ message: "Date already skipped" });

    sub.skippedDates.push(skipDate);

    // If the skipped date is the next delivery date, advance it
    const nextDelivery = new Date(sub.nextDeliveryDate);
    nextDelivery.setHours(0, 0, 0, 0);
    if (nextDelivery.getTime() === skipDate.getTime()) {
      sub.nextDeliveryDate = calculateNextDeliveryDate(sub, skipDate);
    }

    await sub.save();
    res.status(200).json({ message: "Delivery date skipped", subscription: sub });
  } catch (error) {
    console.error("Skip Delivery Date Error:", error);
    res.status(500).json({ message: "Failed to skip delivery date" });
  }
};

export const unskipDeliveryDate = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;
    const { date } = req.body;

    if (!date) return res.status(400).json({ message: "date is required" });

    const unskipDate = new Date(date);
    unskipDate.setHours(0, 0, 0, 0);

    const sub = await Subscription.findOne({ _id: id, userId });
    if (!sub) return res.status(404).json({ message: "Subscription not found" });

    sub.skippedDates = sub.skippedDates.filter(
      (d) => new Date(d).setHours(0, 0, 0, 0) !== unskipDate.getTime()
    );

    await sub.save();
    res.status(200).json({ message: "Date unskipped", subscription: sub });
  } catch (error) {
    console.error("Unskip Delivery Date Error:", error);
    res.status(500).json({ message: "Failed to unskip delivery date" });
  }
};

export const bulkPauseSubscriptions = async (req, res) => {
  try {
    const { subscriptionIds, pauseFrom, pauseUntil } = req.body;

    if (!pauseFrom || !pauseUntil) return res.status(400).json({ message: "pauseFrom and pauseUntil are required" });

    const from = new Date(pauseFrom);
    const until = new Date(pauseUntil);
    if (from >= until) return res.status(400).json({ message: "pauseFrom must be before pauseUntil" });

    let filter = {};
    if (subscriptionIds?.length > 0) {
      filter._id = { $in: subscriptionIds };
    }

    const result = await Subscription.updateMany(filter, {
      $set: { "vacationSchedule.pauseFrom": from, "vacationSchedule.pauseUntil": until },
    });

    res.status(200).json({ message: `${result.modifiedCount} subscriptions paused`, modifiedCount: result.modifiedCount });
  } catch (error) {
    console.error("Bulk Pause Error:", error);
    res.status(500).json({ message: "Failed to bulk pause subscriptions" });
  }
};

export const bulkResumeSubscriptions = async (req, res) => {
  try {
    const { subscriptionIds } = req.body;

    let filter = {};
    if (subscriptionIds?.length > 0) {
      filter._id = { $in: subscriptionIds };
    }

    const result = await Subscription.updateMany(filter, {
      $set: { "vacationSchedule.pauseFrom": null, "vacationSchedule.pauseUntil": null },
    });

    res.status(200).json({ message: `${result.modifiedCount} subscriptions resumed`, modifiedCount: result.modifiedCount });
  } catch (error) {
    console.error("Bulk Resume Error:", error);
    res.status(500).json({ message: "Failed to bulk resume subscriptions" });
  }
};
