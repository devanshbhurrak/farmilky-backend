import Cart from "../models/cart.model.js";
import Product from "../models/product.model.js";

export const getCart = async (req, res) => {
    try {
        const userId = req.user._id;

        const cart = await Cart.findOne({userId}).populate('items.productId');

        if(!cart)
            return res.status(200).json({ items: [], totalItems: 0});

        res.status(200).json({
            items: cart.items,
            totalItems: cart.items?.length
        })
    } catch (error) {
        console.error('Get Cart Error', error);
        res.status(500).json({message: 'Failed to fetch cart'})
    }
}

export const addToCart = async (req, res) => {
    try {
        const userId = req.user._id;
        const { productId, quantity } = req.body;

        if(!productId)
            return res.status(400).json({message: 'Product ID is required'});

        const product = await Product.findById(productId);
        if(!product)
            return res.status(400).json({message: "Product not found"})

        let cart = await Cart.findOne({userId});

        if(!cart) {
            cart = new Cart({
                userId,
                items: [{productId, quantity: quantity || 1}]
            })
        } else {
            const existingItem = cart.items.find(
                (item) => item.productId.toString() === productId
            )

            if(existingItem) {
                existingItem.quantity += quantity || 1;
            } else {
                cart.items.push({productId, quantity: quantity || 1})
            }
        }
        await cart.save();
        res.status(200).json({message: 'Added to cart', cart})
    } catch (error) {
        console.error("Add to Cart Error:", error);
        res.status(500).json({ message: "Failed to add to cart" });
    }
}

export const updateCartItem = async (req, res) => {
    try {
        const userId = req.user._id;
        const {productId, quantity} = req.body;

        if(!productId || !quantity)
            return res.status(400).json({message: 'Product Id and quantity required'});

        let cart = await Cart.findOne({userId});

        if(!cart)
            return res.status(404).json({message: 'Cart not found'});

        const item = cart.items.find((item) => item.productId.toString() === productId);

        if(!item)
            return res.status(404).json({message: 'Item not found in the cart'});

        if(quantity <= 0) {
            cart.items = cart.items.filter((item) => item.productId.toString() !== productId)
        } else {
            item.quantity = quantity;
        }

        await cart.save()

        res.status(200).json({
            message: 'Cart updated',
            cart
        })
    } catch (error) {
        console.error("Update Cart Error:", error);
        res.status(500).json({message: 'Failed to update cart'})
    }
}

export const removeFromCart = async (req, res) => {
    try {
        const userId = req.user._id;
        const {productId} = req.body;

        let cart = await Cart.findOne({userId});

        if(!cart)
            return res.status(404).json({message: 'Cart not found'});
        
        cart.items = cart.items.filter(
            (item) => item.productId.toString() !== productId
        )
        await cart.save();

        res.status(200).json({
            message: 'Cart updated',
            cart,
        })
    } catch (error) {
        console.error('Remove Cart Error', error);
        res.status(500).json({message:'Failed to remove item'});
    }
}

export const clearCart = async (req, res) => {
    try {
        const userId = req.user._id

        await Cart.findOneAndUpdate({ userId }, {items: []});

        res.status(200).json({message: 'Cart cleared'});
    } catch (error) {
        console.error('Clear cart Error', error);
        res.status(500).json({message: 'Failed to clear cart'});
    }
}