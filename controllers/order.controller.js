import mongoose from "mongoose";
import Cart from "../models/cart.model.js";
import Order from "../models/order.model.js";
import Area from "../models/area.model.js";
import Product from "../models/product.model.js";
import User from "../models/user.model.js";
import Subscription from "../models/subscription.model.js";

export const updateOrderAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { items, address, paymentMethod, paymentStatus, orderStatus } = req.body;

    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    const oldTotalAmount = order.totalAmount;
    const oldStatus = order.orderStatus;

    if (address) {
      order.address = address;
      if (address.pincode) {
        const matchedArea = await Area.findOne({ pincodes: address.pincode, isActive: true });
        if (matchedArea) {
          order.areaId = matchedArea._id;
        }
      }
    }

    if (items && items.length > 0) {
      const orderItems = await Promise.all(
        items.map(async (item) => {
          const product = await Product.findById(item.productId);
          if (!product) throw new Error(`Product ${item.productId} not found`);
          const parsedQty = Number.parseInt(item.quantity, 10);
          if (!Number.isInteger(parsedQty) || parsedQty < 1) throw new Error(`Invalid quantity for product ${item.productId}`);

          let effectivePrice = product.price;
          let variantId = null;
          let variantLabel = null;
          let unit = product.unit ?? null;
          let originalPrice = null;

          if (item.variantId && product.variants?.length > 0) {
            const variant = product.variants.id(item.variantId);
            if (variant) {
              effectivePrice = variant.discountedPrice ?? variant.price;
              variantId = variant._id;
              variantLabel = variant.label;
              unit = variant.unit;
              originalPrice = variant.discountedPrice != null ? variant.price : null;
            }
          }

          return {
            productId: product._id,
            name: product.name,
            price: effectivePrice,
            originalPrice,
            image: product.image,
            quantity: parsedQty,
            variantId,
            variantLabel,
            unit,
          };
        })
      );
      order.items = orderItems;
      order.totalAmount = orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    }

    if (paymentMethod) order.paymentMethod = paymentMethod;
    if (paymentStatus) order.paymentStatus = paymentStatus;

    // Capture before any clearing — needed for subscription reversal in the transaction
    const originalPaymentMode = order.paymentMode;
    const originalLinkedSubscriptionId = order.linkedSubscriptionId;

    let balanceAdjustment = 0;
    const statusChanged = orderStatus && orderStatus !== oldStatus;

    if (statusChanged) {
      if (oldStatus === "delivered") {
        // Was delivered, now something else → reverse using OLD amount
        balanceAdjustment -= oldTotalAmount;
        // Clear stale payment mode fields so the saved document is clean
        order.paymentMode = "pay_at_delivery";
        order.linkedSubscriptionId = null;
        order.deliveredAt = null;
      }

      order.orderStatus = orderStatus;

      if (orderStatus === "delivered") {
        balanceAdjustment += order.totalAmount;
        if (!order.deliveredAt) order.deliveredAt = Date.now();
      }

      if (orderStatus === "cancelled" && !order.cancelledAt) order.cancelledAt = Date.now();
    } else if (order.orderStatus === "delivered" && order.totalAmount !== oldTotalAmount) {
      // Items changed on a delivered order without status change — adjust the difference
      balanceAdjustment += order.totalAmount - oldTotalAmount;
    }

    // Build stock ops for status transitions
    let stockOps = null;
    if (statusChanged) {
      if (orderStatus === "cancelled" && oldStatus !== "cancelled") {
        stockOps = order.items.map((item) => {
          if (item.variantId) {
            return { updateOne: { filter: { _id: item.productId, "variants._id": item.variantId }, update: { $inc: { "variants.$.stock": item.quantity } } } };
          }
          return { updateOne: { filter: { _id: item.productId }, update: { $inc: { stock: item.quantity } } } };
        });
      } else if (oldStatus === "cancelled" && orderStatus !== "cancelled") {
        stockOps = order.items.map((item) => {
          if (item.variantId) {
            return { updateOne: { filter: { _id: item.productId, "variants._id": item.variantId }, update: { $inc: { "variants.$.stock": -item.quantity } } } };
          }
          return { updateOne: { filter: { _id: item.productId }, update: { $inc: { stock: -item.quantity } } } };
        });
      }
    }

    // Transaction: save + stock + balance — all atomic
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await order.save({ session });
        if (stockOps) await Product.bulkWrite(stockOps, { session });
        if (balanceAdjustment !== 0) {
          await User.findByIdAndUpdate(order.userId, {
            $inc: { accountBalance: balanceAdjustment }
          }, { session });
          // Revert case: was subscription_ledger delivered, now being un-delivered
          if (oldStatus === "delivered" && originalPaymentMode === "subscription_ledger" && originalLinkedSubscriptionId) {
            await Subscription.findByIdAndUpdate(originalLinkedSubscriptionId, {
              $inc: { pendingAmount: balanceAdjustment }
            }, { session });
          // New or updated delivery via subscription_ledger, or items changed on subscription_ledger order
          } else if (order.paymentMode === "subscription_ledger" && order.linkedSubscriptionId) {
            await Subscription.findByIdAndUpdate(order.linkedSubscriptionId, {
              $inc: { pendingAmount: balanceAdjustment }
            }, { session });
          }
        }
      });
    } finally {
      await session.endSession();
    }

    res.status(200).json({
      message: "Order updated successfully by admin",
      order,
      adjustment: balanceAdjustment,
    });
  } catch (error) {
    console.error("Update Order Admin Error:", error);
    res.status(500).json({ message: "Failed to update order" });
  }
};

export const createOrderAdmin = async (req, res) => {
  try {
    const { userId, items, address, paymentMethod, paymentStatus, orderStatus } = req.body;

    if (!userId || !items || items.length === 0 || !address) {
      return res.status(400).json({ message: "User, items, and address are required" });
    }

    for (const item of items) {
      const qty = Number.parseInt(item.quantity, 10);
      if (!Number.isInteger(qty) || qty < 1) {
        return res.status(400).json({ message: "Each item must have a valid quantity (positive integer)." });
      }
    }

    const orderItems = await Promise.all(
      items.map(async (item) => {
        const product = await Product.findById(item.productId);
        if (!product) throw new Error(`Product ${item.productId} not found`);

        let effectivePrice = product.price;
        let variantId = null;
        let variantLabel = null;
        let unit = product.unit ?? null;
        let originalPrice = null;

        if (item.variantId && product.variants?.length > 0) {
          const variant = product.variants.id(item.variantId);
          if (variant) {
            effectivePrice = variant.discountedPrice ?? variant.price;
            variantId = variant._id;
            variantLabel = variant.label;
            unit = variant.unit;
            originalPrice = variant.discountedPrice != null ? variant.price : null;
          }
        }

        return {
          productId: product._id,
          name: product.name,
          price: effectivePrice,
          originalPrice,
          image: product.image,
          quantity: Number.parseInt(item.quantity, 10),
          variantId,
          variantLabel,
          unit,
        };
      })
    );

    const totalAmount = parseFloat(orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0).toFixed(2));

    let areaId = null;
    if (address?.pincode) {
      const matchedArea = await Area.findOne({ pincodes: address.pincode, isActive: true });
      if (matchedArea) {
        areaId = matchedArea._id;
      }
    }

    const newOrder = new Order({
      userId,
      items: orderItems,
      address,
      totalAmount,
      paymentMethod: paymentMethod || "COD",
      paymentStatus: paymentStatus || (paymentMethod === "COD" ? "pending" : "paid"),
      orderStatus: orderStatus || "confirmed",
      areaId,
    });

    // Build stock decrement ops
    const stockUpdates = orderItems.map((item) => {
      if (item.variantId) {
        return {
          updateOne: {
            filter: { _id: item.productId, "variants._id": item.variantId },
            update: { $inc: { "variants.$.stock": -item.quantity } },
          },
        };
      }
      return {
        updateOne: {
          filter: { _id: item.productId },
          update: { $inc: { stock: -item.quantity } },
        },
      };
    });

    // If created as delivered, save order + update balance + stock atomically
    if (newOrder.orderStatus === "delivered") {
      if (!newOrder.deliveredAt) newOrder.deliveredAt = Date.now();
      if (newOrder.paymentMethod === "COD") newOrder.paymentStatus = "paid";
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          await newOrder.save({ session });
          await Product.bulkWrite(stockUpdates, { session });
          await User.findByIdAndUpdate(userId, {
            $inc: { accountBalance: totalAmount }
          }, { session });
        });
      } finally {
        await session.endSession();
      }
    } else {
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          await newOrder.save({ session });
          await Product.bulkWrite(stockUpdates, { session });
        });
      } finally {
        await session.endSession();
      }
    }

    res.status(201).json({
      message: "Order created successfully by admin",
      order: newOrder,
    });
  } catch (error) {
    console.error("Create Order Admin Error:", error);
    res.status(500).json({ message: "Failed to create order" });
  }
};

export const createOrder = async (req, res) => {
    try {
        const userId = req.user._id;

        const { address, paymentMethod } = req.body;

        if (!address)
            return res.status(400).json({ message: 'Delivery address is required' })

        const cart = await Cart.findOne({ userId }).populate("items.productId");

        if (!cart || cart.items.length === 0)
            return res.status(400).json({ message: 'Cart is empty' })

        const orderItems = cart.items.map((item) => {
            const product = item.productId;
            let effectivePrice = product.price;
            let variantId = null;
            let variantLabel = null;
            let unit = null;
            let originalPrice = null;

            if (item.variantId && product.variants?.length > 0) {
                const variant = product.variants.id(item.variantId);
                if (variant) {
                    effectivePrice = variant.discountedPrice ?? variant.price;
                    variantId = variant._id;
                    variantLabel = item.variantLabel;
                    unit = variant.unit;
                    originalPrice = variant.discountedPrice != null ? variant.price : null;
                }
            }

            return {
                productId: product._id,
                name: product.name,
                price: effectivePrice,
                image: product.image,
                quantity: item.quantity,
                variantId,
                variantLabel,
                unit,
                originalPrice,
            };
        })

        const totalAmount = parseFloat(orderItems.reduce(
            (sum, item) => sum + item.price * item.quantity,
            0
        ).toFixed(2));

        // Auto-detect area from pincode
        let areaId = null;
        if (address?.pincode) {
          const matchedArea = await Area.findOne({ pincodes: address.pincode, isActive: true });
          if (matchedArea) {
            areaId = matchedArea._id;
          }
        }

        const newOrder = new Order({
            userId,
            items: orderItems,
            address,
            totalAmount,
            paymentMethod,
            paymentStatus: paymentMethod === 'COD' ? 'pending' : 'paid',
            orderStatus: 'confirmed',
            areaId,
        })

        // Decrement stock for each product
        const stockUpdates = orderItems.map((item) => {
            if (item.variantId) {
                return {
                    updateOne: {
                        filter: { _id: item.productId, "variants._id": item.variantId },
                        update: { $inc: { "variants.$.stock": -item.quantity } },
                    },
                };
            }
            return {
                updateOne: {
                    filter: { _id: item.productId },
                    update: { $inc: { stock: -item.quantity } },
                },
            };
        });

        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                await newOrder.save({ session });
                await Product.bulkWrite(stockUpdates, { session });
                await Cart.findOneAndUpdate({ userId }, { items: [] }, { session });
            });
        } finally {
            await session.endSession();
        }

        res.status(201).json({
            message: 'Order created successfully',
            order: newOrder
        })

    } catch (error) {
        console.error("Create Order Error:", error);
        res.status(500).json({ message: "Failed to create order" });
    }
}

export const getUserOrders = async (req, res) => {
    try {
        const userId = req.user._id

        const order = await Order.find({ userId }).sort({ createdAt: -1 });

        if (!order || order.length === 0)
            return res.status(200).json({ order: [] });

        res.status(200).json({ order })
    } catch (error) {
        console.error("Get Order Error:", error);
        res.status(500).json({ message: "Failed to fetch order" });
    }
}

export const getOrderById = async (req, res) => {
    try {
        const userId = req.user._id;
        const { id } = req.params;

        const order = await Order.findOne({ _id: id, userId }).populate('items.productId');

        if (!order)
            return res.status(404).json({ message: 'Order not found' });

        res.status(200).json({ order });
    } catch (error) {
        console.error("Get Order Error:", error);
        res.status(500).json({ message: "Failed to fetch order" });
    }
}

export const cancelOrder = async (req, res) => {
    try {
        const userId = req.user._id;
        const { id } = req.params

        const order = await Order.findOne({ _id: id, userId });

        if (!order)
            return res.status(404).json({ message: 'Order not found' });

        if (!['placed', 'confirmed'].includes(order.orderStatus))
            return res.status(400).json({
                message: 'Order cannot be cancelled at this stage'
            });

        order.orderStatus = 'cancelled'
        order.cancelledAt = Date.now();

        const stockRestorations = order.items.map((item) => {
            if (item.variantId) {
                return {
                    updateOne: {
                        filter: { _id: item.productId, "variants._id": item.variantId },
                        update: { $inc: { "variants.$.stock": item.quantity } },
                    },
                };
            }
            return {
                updateOne: {
                    filter: { _id: item.productId },
                    update: { $inc: { stock: item.quantity } },
                },
            };
        });

        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                await order.save({ session });
                await Product.bulkWrite(stockRestorations, { session });
            });
        } finally {
            await session.endSession();
        }

        res.status(200).json({ message: 'Order cancelled successfully' })
    } catch (error) {
        console.error("Cancel Order Error:", error);
        res.status(500).json({ message: "Failed to cancel order" });
    }
}

export const getOrderByIdAdmin = async (req, res) => {
    try {
        const { id } = req.params;

        const order = await Order.findById(id)
            .populate("userId", "name email phone")
            .populate("items.productId");

        if (!order)
            return res.status(404).json({ message: "Order not found" });

        res.status(200).json({ order });
    } catch (error) {
        console.error("Get Order By Id Admin Error:", error);
        res.status(500).json({ message: "Failed to fetch order." });
    }
};

export const getAllOrder = async (req, res) => {
    try {
        const orders = await Order.find().populate('userId').sort({ createdAt: -1 })

        res.status(200).json({ orders });
    } catch (error) {
        console.error("Get All Orders Error:", error);
        res.status(500).json({ message: "Failed to fetch orders" });
    }
}

export const recordOrderDeliveryOutcome = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reason, notes, deliveryDate, paymentMode = "pay_at_delivery", subscriptionId } = req.body;

    if (!["delivered", "failed"].includes(status)) {
      return res.status(400).json({ message: "Status must be 'delivered' or 'failed'." });
    }

    if (status === "failed" && !reason) {
      return res.status(400).json({ message: "A reason is required for failed deliveries." });
    }

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (order.orderStatus === "delivered") {
      return res.status(409).json({ message: "Order is already delivered." });
    }

    if (status === "delivered") {
      order.orderStatus = "delivered";
      order.deliveredAt = Date.now();
      order.deliveryAttempts.push({
        attemptDate: deliveryDate ? new Date(deliveryDate) : new Date(),
        status: "delivered",
        reason: reason || null,
        notes: notes || null,
        handledBy: req.user?._id || null,
      });

      // Pre-transaction validation for subscription_ledger
      if (paymentMode === "subscription_ledger") {
        if (!subscriptionId) {
          return res.status(400).json({ message: "subscriptionId is required for subscription_ledger payment mode." });
        }
        const subscription = await Subscription.findById(subscriptionId);
        if (!subscription) {
          return res.status(404).json({ message: "Subscription not found." });
        }
        if (subscription.status !== "active") {
          return res.status(409).json({ message: "Subscription is no longer active." });
        }
        if (subscription.userId.toString() !== order.userId.toString()) {
          return res.status(403).json({ message: "Subscription does not belong to this customer." });
        }
      }

      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          if (paymentMode === "subscription_ledger") {
            order.paymentStatus = "pending";
            order.paymentMode = "subscription_ledger";
            order.linkedSubscriptionId = subscriptionId;
            await order.save({ session });
            await User.findByIdAndUpdate(order.userId, { $inc: { accountBalance: order.totalAmount } }, { session });
            await Subscription.findByIdAndUpdate(subscriptionId, { $inc: { pendingAmount: order.totalAmount } }, { session });
          } else {
            if (order.paymentMethod === "COD") {
              order.paymentStatus = "paid";
            }
            order.paymentMode = "pay_at_delivery";
            await order.save({ session });
            await User.findByIdAndUpdate(order.userId, { $inc: { accountBalance: order.totalAmount } }, { session });
          }
        });
      } finally {
        await session.endSession();
      }
    } else {
      order.deliveryAttempts.push({
        attemptDate: deliveryDate ? new Date(deliveryDate) : new Date(),
        status: "failed",
        reason: reason || null,
        notes: notes || null,
        handledBy: req.user?._id || null,
      });
      await order.save();
    }

    res.status(200).json({
      message: status === "delivered" ? "Order marked as delivered." : "Failed attempt recorded.",
      order,
    });
  } catch (error) {
    console.error("Record Order Delivery Outcome Error:", error);
    res.status(500).json({ message: "Failed to record order delivery outcome." });
  }
};

export const createInstantDelivery = async (req, res) => {
  try {
    const { customerId, items, paymentMode = "pay_at_delivery", subscriptionId, notes, date } = req.body;

    if (!customerId) {
      return res.status(400).json({ message: "customerId is required." });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "At least one item is required." });
    }
    if (!["pay_at_delivery", "subscription_ledger"].includes(paymentMode)) {
      return res.status(400).json({ message: "paymentMode must be 'pay_at_delivery' or 'subscription_ledger'." });
    }
    if (paymentMode === "subscription_ledger" && !subscriptionId) {
      return res.status(400).json({ message: "subscriptionId is required for subscription_ledger payment mode." });
    }

    // Validate each item
    for (const item of items) {
      if (!item.productId) return res.status(400).json({ message: "Each item must have a productId." });
      const qty = Number(item.quantity);
      if (!Number.isInteger(qty) || qty < 1) {
        return res.status(400).json({ message: `Invalid quantity for product ${item.productId}. Must be a positive integer.` });
      }
      const price = Number(item.price);
      if (isNaN(price) || price < 0) {
        return res.status(400).json({ message: `Invalid price for product ${item.productId}. Must be >= 0.` });
      }
    }

    // Resolve products — validates each productId and fetches image/unit
    const orderItems = await Promise.all(
      items.map(async (item) => {
        const product = await Product.findById(item.productId);
        if (!product) throw new Error(`Product ${item.productId} not found.`);
        if (!product.isAvailable) throw new Error(`Product "${product.name}" is not available.`);

        const effectivePrice = Number(item.price) >= 0 ? Number(item.price) : product.price;
        let variantId = null;
        let variantLabel = null;
        let unit = product.unit ?? "unit";
        let originalPrice = null;

        if (item.variantId && product.variants?.length > 0) {
          const variant = product.variants.id(item.variantId);
          if (variant) {
            variantId = variant._id;
            variantLabel = variant.label;
            unit = variant.unit;
            originalPrice = variant.discountedPrice != null ? variant.price : null;
          }
        }

        return {
          productId: product._id,
          name: product.name,
          price: effectivePrice,
          originalPrice,
          image: product.image,
          quantity: Number(item.quantity),
          variantId,
          variantLabel,
          unit,
        };
      })
    );

    const totalAmount = parseFloat(orderItems.reduce((sum, i) => sum + i.price * i.quantity, 0).toFixed(2));

    // Validate subscription if using ledger payment
    if (paymentMode === "subscription_ledger") {
      const subscription = await Subscription.findById(subscriptionId);
      if (!subscription) return res.status(404).json({ message: "Subscription not found." });
      if (subscription.status !== "active") return res.status(409).json({ message: "Subscription is no longer active." });
      if (subscription.userId.toString() !== String(customerId)) {
        return res.status(403).json({ message: "Subscription does not belong to this customer." });
      }
    }

    // Resolve customer address and area
    const customer = await User.findById(customerId).select("addresses assignedArea");
    if (!customer) return res.status(404).json({ message: "Customer not found." });
    const savedAddr = customer.addresses?.find((a) => a.isDefault) || customer.addresses?.[0];
    const address = savedAddr
      ? { street: savedAddr.street || "On-demand", city: savedAddr.city || "-", pincode: String(savedAddr.pincode || "000000"), state: savedAddr.state || "-" }
      : { street: "On-demand", city: "-", pincode: "000000", state: "-" };

    const deliveredAt = date ? new Date(date) : new Date();

    const areaId = customer.assignedArea
      ? String(customer.assignedArea._id || customer.assignedArea)
      : null;

    const newOrder = new Order({
      userId: customerId,
      items: orderItems,
      address,
      totalAmount,
      paymentMethod: "COD",
      paymentStatus: paymentMode === "pay_at_delivery" ? "paid" : "pending",
      orderStatus: "delivered",
      deliveredAt,
      paymentMode,
      areaId,
      linkedSubscriptionId: paymentMode === "subscription_ledger" ? subscriptionId : null,
      deliveryAttempts: [{ status: "delivered", notes: notes || null, handledBy: req.user?._id || null }],
    });

    // Build stock decrement ops
    const stockOps = orderItems.map((item) => {
      if (item.variantId) {
        return { updateOne: { filter: { _id: item.productId, "variants._id": item.variantId }, update: { $inc: { "variants.$.stock": -item.quantity } } } };
      }
      return { updateOne: { filter: { _id: item.productId }, update: { $inc: { stock: -item.quantity } } } };
    });

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await newOrder.save({ session });
        await Product.bulkWrite(stockOps, { session });
        await User.findByIdAndUpdate(customerId, { $inc: { accountBalance: totalAmount } }, { session });
        if (paymentMode === "subscription_ledger") {
          await Subscription.findByIdAndUpdate(subscriptionId, { $inc: { pendingAmount: totalAmount } }, { session });
        }
      });
    } finally {
      await session.endSession();
    }

    res.status(201).json({ message: "Instant delivery recorded successfully.", order: newOrder });
  } catch (error) {
    console.error("Create Instant Delivery Error:", error);
    res.status(500).json({ message: error.message || "Failed to record instant delivery." });
  }
};

export const updateOrderStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, paymentMode = "pay_at_delivery", subscriptionId } = req.body;
        const role = req.user?.role;

        const order = await Order.findById(id);

        if (!order)
            return res.status(404).json({ message: 'Order not found' });

        const validStatuses = ["confirmed", "delivered", "cancelled"];

        if (!validStatuses.includes(status))
            return res.status(400).json({ message: 'Invalid order status' });

        if ((role === "delivery_partner" || role === "delivery" || role === "agent") && status !== "delivered") {
            return res.status(403).json({
                message: "Delivery partner can only mark orders as delivered.",
            });
        }

        const oldStatus = order.orderStatus;
        if (status === oldStatus) {
            return res.status(200).json({ message: 'Order status updated successfully', order, adjustment: 0 });
        }

        // Capture original values before clearing — needed for subscription reversal
        const originalPaymentMode = order.paymentMode;
        const originalLinkedSubscriptionId = order.linkedSubscriptionId;

        let balanceAdjustment = 0;
        if (oldStatus === "delivered") {
            balanceAdjustment -= order.totalAmount;
            // Clear payment mode fields when reverting a delivered order
            order.paymentMode = "pay_at_delivery";
            order.linkedSubscriptionId = null;
            order.deliveredAt = null;
        }

        order.orderStatus = status;

        if (status === 'delivered') {
            balanceAdjustment += order.totalAmount;
            order.deliveredAt = Date.now();

            if (paymentMode === "subscription_ledger") {
                if (!subscriptionId) {
                    return res.status(400).json({ message: "subscriptionId is required for subscription_ledger payment mode." });
                }
                const subscription = await Subscription.findById(subscriptionId);
                if (!subscription) {
                    return res.status(404).json({ message: "Subscription not found." });
                }
                if (subscription.status !== "active") {
                    return res.status(409).json({ message: "Subscription is no longer active." });
                }
                if (subscription.userId.toString() !== order.userId.toString()) {
                    return res.status(403).json({ message: "Subscription does not belong to this customer." });
                }
                order.paymentStatus = "pending";
                order.paymentMode = "subscription_ledger";
                order.linkedSubscriptionId = subscriptionId;
            } else {
                if (order.paymentMethod === 'COD') {
                    order.paymentStatus = 'paid';
                }
                order.paymentMode = "pay_at_delivery";
            }
        } else if (status === 'cancelled') {
            order.cancelledAt = Date.now();
        }

        // Build stock ops
        let stockOps = null;
        if (status === "cancelled" && oldStatus !== "cancelled") {
            stockOps = order.items.map((item) => {
                if (item.variantId) {
                    return { updateOne: { filter: { _id: item.productId, "variants._id": item.variantId }, update: { $inc: { "variants.$.stock": item.quantity } } } };
                }
                return { updateOne: { filter: { _id: item.productId }, update: { $inc: { stock: item.quantity } } } };
            });
        } else if (oldStatus === "cancelled" && status !== "cancelled") {
            stockOps = order.items.map((item) => {
                if (item.variantId) {
                    return { updateOne: { filter: { _id: item.productId, "variants._id": item.variantId }, update: { $inc: { "variants.$.stock": -item.quantity } } } };
                }
                return { updateOne: { filter: { _id: item.productId }, update: { $inc: { stock: -item.quantity } } } };
            });
        }

        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                await order.save({ session });
                if (stockOps) await Product.bulkWrite(stockOps, { session });
                if (balanceAdjustment !== 0) {
                    await User.findByIdAndUpdate(order.userId, {
                        $inc: { accountBalance: balanceAdjustment }
                    }, { session });
                    // Revert case: was subscription_ledger, now being un-delivered
                    if (oldStatus === "delivered" && originalPaymentMode === "subscription_ledger" && originalLinkedSubscriptionId) {
                        await Subscription.findByIdAndUpdate(originalLinkedSubscriptionId, {
                            $inc: { pendingAmount: balanceAdjustment }
                        }, { session });
                    // New delivery case: being set to delivered via subscription_ledger
                    } else if (status === "delivered" && order.paymentMode === "subscription_ledger" && order.linkedSubscriptionId) {
                        await Subscription.findByIdAndUpdate(order.linkedSubscriptionId, {
                            $inc: { pendingAmount: balanceAdjustment }
                        }, { session });
                    }
                }
            });
        } finally {
            await session.endSession();
        }

        res.status(200).json({
            message: 'Order status updated successfully',
            order,
            adjustment: balanceAdjustment,
        });
    } catch (error) {
        console.error("Update Order Status Error:", error);
        res.status(500).json({ message: "Failed to update order status" });
    }
}
