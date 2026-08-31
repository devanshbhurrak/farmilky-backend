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
    },
    originalPrice: { type: Number, default: null },
    variantId:     { type: mongoose.Schema.Types.ObjectId, default: null },
    variantLabel:  { type: String, default: null },
    unit:          { type: String, default: null },
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
    paymentMode: {
        type: String,
        enum: ["pay_at_delivery", "subscription_ledger"],
        default: "pay_at_delivery",
    },
    linkedSubscriptionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Subscription",
        default: null,
    },
    deliveredAt: {
        type: Date,
    },
    cancelledAt: {
        type: Date,
    },
    deliveryAttempts: [{
        attemptDate:  { type: Date, default: Date.now },
        status:       { type: String, enum: ["delivered", "failed"], required: true },
        reason:       { type: String, default: null },
        notes:        { type: String, default: null },
        handledBy:    { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    }],
    areaId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Area",
        default: null,
    },
    assignedAgent: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null,
    },
}, { timestamps: true })

orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ orderStatus: 1, createdAt: -1 });
orderSchema.index({ areaId: 1, orderStatus: 1 });

const Order = mongoose.model("Order", orderSchema);

export default Order;