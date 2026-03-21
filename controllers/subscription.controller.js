import Product from "../models/product.model.js";
import Subscription from "../models/subscription.model.js";

export const createSubscription = async (req, res) => {
  try {
    const userId = req.user._id;
    const { productId, quantityPerDay, deliverySchedule = "daily", customDays = [] } =
      req.body;

    if (!productId || !quantityPerDay) {
      return res.status(400).json({ message: "Product and quantity required" });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // 1️⃣ Calculate price
    const totalPricePerDay = product.price * quantityPerDay;

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
      quantityPerDay,
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
