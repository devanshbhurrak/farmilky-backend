import mongoose, { mongo } from 'mongoose';

const orderItemSchema = new mongoose.Schema({
    productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true,
    },
    name: {
        type: String,
        required: true,
    },
    price: {
        type: Number,
        required: true,
    },
    quantity: {
        type: Number,
        required: true,
        min: 1
    },
    image: {
        type: String,
        required: true,
    }
})

const addressSchema = new mongoose.Schema({
    street: {
        type: String,
        required: true
    },
    city: {
        type: String,
        required: true
    },
    pincode: {
        type: String,
        required: true
    },
    state: {
        type: String,
        required: true
    }
})

const orderSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },

    items: [orderItemSchema],

    address: addressSchema,

    totalAmount: {
        type: Number,
        required: true,
    },

    paymentStatus: {
        type: String,
        enum: ["pending", "paid", "failed"],
        default: "pending"
    },

    orderStatus: {
        type: String,
        enum: [
            "placed",
            "confirmed",
            "delivered",
            "cancelled"
        ],
        default: "placed",
    },

    transactionId: {
        type: String,
        default: null,
    },
    paymentMethod: {
        type: String,
        enum: ["COD", "Online"],
        required: true,
        default: "COD"
    },
    deliveredAt: {
        type: Date,
    },
    cancelledAt: {
        type: Date,
    },
}, { timestamps: true })


const Order = mongoose.model("Order", orderSchema);

export default Order;