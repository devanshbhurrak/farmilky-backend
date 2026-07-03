import mongoose from "mongoose";

const variantSchema = new mongoose.Schema({
  label:           { type: String, required: true, trim: true },
  quantity:        { type: Number, required: true },
  unit:            { type: String, enum: ['L','ml','kg','g','unit'], required: true },
  price:           { type: Number, required: true, min: 0 },
  discountedPrice: { type: Number, default: null, min: 0 },
  stock:           { type: Number, default: 100 },
  isDefault:       { type: Boolean, default: false },
  isAvailable:     { type: Boolean, default: true },
}, { _id: true });

const productSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Product name is required'],
        trim: true,
    },
    description: {
        type: String,
        required: true,
    },
    category: {
        type: String,
        enum: ['milk', 'ghee', 'paneer', 'curd', 'butter', 'cheese', 'other'],
        required: true
    },
    price: {
        type: Number,
        required: true,
        min: [0, 'Price must be positive'],
    },
    unit: {
        type: String,
        enum: ['L', 'ml', 'kg', 'g', 'unit'],
        default: 'L'
    },
    fatContent: {
        type: String,
        default: null
    },
    stock: {
        type: Number,
        default: 100,
    },
    image: {
        type: String,
        required: true,
    },
    isAvailable: {
        type: Boolean,
        default: true,
    },
    variants: { type: [variantSchema], default: [] }

}, {timestamps: true});

const Product = mongoose.model('Product', productSchema);

export default Product