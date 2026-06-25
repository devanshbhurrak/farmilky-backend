import Cart from "../models/cart.model.js";
import Order from "../models/order.model.js";
import Area from "../models/area.model.js";
import Product from "../models/product.model.js";
import User from "../models/user.model.js";

export const updateOrderAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { items, address, paymentMethod, paymentStatus, orderStatus } = req.body;

    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ message: "Order not found" });

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
          return {
            productId: product._id,
            name: product.name,
            price: product.price,
            image: product.image,
            quantity: item.quantity,
          };
        })
      );
      order.items = orderItems;
      order.totalAmount = orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    }

    if (paymentMethod) order.paymentMethod = paymentMethod;
    if (paymentStatus) order.paymentStatus = paymentStatus;

    let balanceAdjustment = 0;
    if (orderStatus && orderStatus !== order.orderStatus) {
      // Calculate adjustment
      if (order.orderStatus === "delivered") {
        // Was delivered, now something else -> Subtract amount (Credit reversal)
        balanceAdjustment -= order.totalAmount;
      }
      
      order.orderStatus = orderStatus;
      
      if (orderStatus === "delivered") {
        // Now delivered -> Add amount (Debit)
        balanceAdjustment += order.totalAmount;
        if (!order.deliveredAt) order.deliveredAt = Date.now();
      }
      
      if (orderStatus === "cancelled" && !order.cancelledAt) order.cancelledAt = Date.now();
    }

    await order.save();

    // Apply balance adjustment if status changed
    if (balanceAdjustment !== 0) {
        await User.findByIdAndUpdate(order.userId, {
            $inc: { accountBalance: balanceAdjustment }
        });
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

    const orderItems = await Promise.all(
      items.map(async (item) => {
        const product = await Product.findById(item.productId);
        if (!product) throw new Error(`Product ${item.productId} not found`);
        return {
          productId: product._id,
          name: product.name,
          price: product.price,
          image: product.image,
          quantity: item.quantity,
        };
      })
    );

    const totalAmount = orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

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

    await newOrder.save();

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

        const orderItems = cart.items.map((item) => ({
            productId: item.productId._id,
            name: item.productId.name,
            price: item.productId.price,
            image: item.productId.image,
            quantity: item.quantity
        }))

        const totalAmount = orderItems.reduce(
            (sum, item) => sum + item.price * item.quantity,
            0
        );

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

        await newOrder.save();

        // 3️⃣ Decrement stock for each product
        const stockUpdates = orderItems.map((item) => ({
            updateOne: {
                filter: { _id: item.productId },
                update: { $inc: { stock: -item.quantity } },
            },
        }));
        await Product.bulkWrite(stockUpdates);

        await Cart.findOneAndUpdate({ userId }, { items: [] })

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
        await order.save();

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
    const { status, reason, notes, deliveryDate } = req.body;

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
      if (order.paymentMethod === "COD") {
        order.paymentStatus = "paid";
      }
      order.deliveryAttempts.push({
        attemptDate: deliveryDate ? new Date(deliveryDate) : new Date(),
        status: "delivered",
        reason: reason || null,
        notes: notes || null,
        handledBy: req.user?._id || null,
      });
    } else {
      order.deliveryAttempts.push({
        attemptDate: deliveryDate ? new Date(deliveryDate) : new Date(),
        status: "failed",
        reason: reason || null,
        notes: notes || null,
        handledBy: req.user?._id || null,
      });
    }

    await order.save();

    // Update user account balance if delivered
    if (status === "delivered") {
        await User.findByIdAndUpdate(order.userId, {
            $inc: { accountBalance: order.totalAmount }
        });
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

export const updateOrderStatus = async (req, res) => {
    try {
        const { id } = req.params
        const { status } = req.body;
        const role = req.user?.role;

        const order = await Order.findById(id)

        if (!order)
            return res.status(404).json({ message: 'Order not found' });

        const validStatuses = [
            "confirmed",
            "delivered",
            "cancelled",
        ]

        if (!validStatuses.includes(status))
            return res.status(400).json({ message: 'Invalid order status' });

        if ((role === "delivery_partner" || role === "delivery" || role === "agent") && status !== "delivered") {
            return res.status(403).json({
                message: "Delivery partner can only mark orders as delivered.",
            });
        }

        let balanceAdjustment = 0;
        if (status !== order.orderStatus) {
            if (order.orderStatus === "delivered") {
                balanceAdjustment -= order.totalAmount;
            }
            
            order.orderStatus = status;

            if (status === 'delivered') {
                balanceAdjustment += order.totalAmount;
                order.deliveredAt = Date.now();
                if (order.paymentMethod === 'COD') {
                    order.paymentStatus = 'paid';
                }
            } else if (status === 'cancelled') {
                order.cancelledAt = Date.now();
            }
        }

        await order.save()

        // Apply balance adjustment
        if (balanceAdjustment !== 0) {
            await User.findByIdAndUpdate(order.userId, {
                $inc: { accountBalance: balanceAdjustment }
            });
        }

        res.status(200).json({
            message: 'Order status updated successfully',
            order,
            adjustment: balanceAdjustment,
        })
    } catch (error) {
        console.error("Update Order Status Error:", error);
        res.status(500).json({ message: "Failed to update order status" });
    }
}
