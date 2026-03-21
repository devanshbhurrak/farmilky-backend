import Cart from "../models/cart.model.js";
import Order from "../models/order.model.js";

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

        const newOrder = new Order({
            userId,
            items: orderItems,
            address,
            totalAmount,
            paymentMethod,
            paymentStatus: paymentMethod === 'COD' ? 'pending' : 'paid',
            orderStatus: 'confirmed'
        })

        await newOrder.save();

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

        if (order.orderStatus !== 'confirmed')
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

export const getAllOrder = async (req, res) => {
    try {
        const orders = await Order.find().populate('userId').sort({ createdAt: -1 })

        res.status(200).json({ orders });
    } catch (error) {
        console.error("Get All Orders Error:", error);
        res.status(500).json({ message: "Failed to fetch orders" });
    }
}

export const updateOrderStatus = async (req, res) => {
    try {
        const { id } = req.params
        const { status } = req.body;

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

        order.orderStatus = status;

        if (status === 'delivered') {
            order.deliveredAt = Date.now();
            if (order.paymentMethod === 'COD') {
                order.paymentStatus = 'paid';
            }
        } else if (status === 'cancelled') {
            order.cancelledAt = Date.now();
        }

        await order.save()

        res.status(200).json({
            message: 'Order status updated successfully',
            order,
        })
    } catch (error) {
        console.error("Update Order Status Error:", error);
        res.status(500).json({ message: "Failed to update order status" });
    }
}
