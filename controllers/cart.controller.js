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
        const { productId, quantity, variantId } = req.body;

        if(!productId || !Number.isInteger(quantity) || quantity < 1)
            return res.status(400).json({message: 'Product ID and a valid positive quantity are required'});

        const product = await Product.findById(productId);
        if(!product)
            return res.status(400).json({message: "Product not found"})

        let resolvedVariantId = null;
        let resolvedVariantLabel = null;

        if (product.variants?.length > 0) {
            let variant;
            if (variantId) {
                variant = product.variants.id(variantId);
                if (!variant) return res.status(400).json({ message: "Variant not found" });
            } else {
                variant = product.variants.find(v => v.isDefault) || product.variants[0];
            }
            if (!variant.isAvailable || variant.stock <= 0)
                return res.status(400).json({ message: "This variant is out of stock" });
            resolvedVariantId = variant._id;
            resolvedVariantLabel = variant.label;
        }

        let cart = await Cart.findOne({userId});

        if(!cart) {
            cart = new Cart({
                userId,
                items: [{ productId, quantity: quantity || 1, variantId: resolvedVariantId, variantLabel: resolvedVariantLabel }]
            })
        } else {
            const existingItem = cart.items.find(
                (item) => item.productId.toString() === productId &&
                    String(item.variantId ?? null) === String(resolvedVariantId ?? null)
            )
            if(existingItem) {
                existingItem.quantity += quantity || 1;
            } else {
                cart.items.push({ productId, quantity: quantity || 1, variantId: resolvedVariantId, variantLabel: resolvedVariantLabel })
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
        const { productId, quantity, variantId } = req.body;

        if(!productId || quantity === undefined || quantity === null)
            return res.status(400).json({message: 'Product Id and quantity required'});

        let cart = await Cart.findOne({userId});
        if(!cart)
            return res.status(404).json({message: 'Cart not found'});

        const normalizedVariantId = variantId ?? null;
        const item = cart.items.find(
            (item) => item.productId.toString() === productId &&
                String(item.variantId ?? null) === String(normalizedVariantId)
        );

        if(!item)
            return res.status(404).json({message: 'Item not found in the cart'});

        if(quantity <= 0) {
            cart.items = cart.items.filter(
                (item) => !(item.productId.toString() === productId &&
                    String(item.variantId ?? null) === String(normalizedVariantId))
            )
        } else {
            item.quantity = quantity;
        }

        await cart.save()
        res.status(200).json({ message: 'Cart updated', cart })
    } catch (error) {
        console.error("Update Cart Error:", error);
        res.status(500).json({message: 'Failed to update cart'})
    }
}

export const removeFromCart = async (req, res) => {
    try {
        const userId = req.user._id;
        const { productId, variantId } = req.body;

        let cart = await Cart.findOne({userId});
        if(!cart)
            return res.status(404).json({message: 'Cart not found'});

        const normalizedVariantId = variantId ?? null;
        cart.items = cart.items.filter(
            (item) => !(item.productId.toString() === productId &&
                String(item.variantId ?? null) === String(normalizedVariantId))
        )
        await cart.save();

        res.status(200).json({ message: 'Cart updated', cart })
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
