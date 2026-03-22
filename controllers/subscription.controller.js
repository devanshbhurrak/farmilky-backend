import Product from "../models/product.model.js";
import Subscription from "../models/subscription.model.js";
import { isSubscriptionDueOnDate } from "../services/scheduler.js";

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

    // 1️⃣ Calculate price
    const totalPricePerDay = product.price * parsedQuantityPerDay;

    // 2️⃣ Calculate next delivery date
    const nextDeliveryDate = new Date();

    if (deliverySchedule === "daily") {
      nextDeliveryDate.setDate(nextDeliveryDate.getDate() + 1);
    } else if (deliverySchedule === "alternate") {
      nextDeliveryDate.setDate(nextDeliveryDate.getDate() + 2);
    } else if (deliverySchedule === "custom") {
      if (!customDays.length) {
        return res
          .status(400)
          .json({ message: "Custom days required for custom schedule" });
      }
      nextDeliveryDate.setDate(nextDeliveryDate.getDate() + 1); // basic default
    }

    // 3️⃣ Create subscription
    const subscription = new Subscription({
      userId,
      productId,
      quantityPerDay: parsedQuantityPerDay,
      deliverySchedule,
      customDays: deliverySchedule === "custom" ? customDays : [],
      totalPricePerDay,
      nextDeliveryDate,
      status: "active",
      startDate: new Date(),
      pendingAmount: 0,
      deliveryHistory: [],
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
