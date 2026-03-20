import Product from "../models/product.model.js"

export const createProduct = async (req, res) => {
    try {
        const { name, description, category, price, unit, fatContent, stock, image } = req.body;

        if(!name || !description || !category || !price || !image) {
            return res.status(400).json({message: "Name, description, category, price and image are required"});
        }

        const newProduct = new Product({
            name, description, category, price, unit, fatContent, stock, image
        })

        await newProduct.save();

        res.status(201).json({
            message: 'Product created successfully',
            product: newProduct
        })

    } catch (error) {
        console.error("Create Product Error:", error);
        res.status(500).json({ message: "Server error. Failed to create product." });
    }
}

export const getAllProducts = async (req, res) => {
    try {
        const products = await Product.find().sort({createdAt: -1})

        res.status(200).json({
            count: products.length,
            products,
        })
    } catch (error) {
        console.error("Get All Products Error:", error);
        res.status(500).json({ message: "Failed to fetch products." });
    }
}

export const getProductById = async (req, res) => {
    try {
        const { id } = req.params;
        
        const product = await Product.findById(id);

        if(!product)
            return res.status(404).json({message: 'Product not found'});

        res.status(200).json(product)
    } catch (error) {
        console.error("Get Product Error:", error);
        res.status(500).json({ message: "Failed to fetch product." });
    }
}

export const updateProduct = async (req, res) => {
    try {
        const {id} = req.params

        const updateProduct = await Product.findByIdAndUpdate(id, req.body, {
            new: true, runValidators: true
        })

        if(!updateProduct)
            return res.status(404).json({message: 'Product not found'});

        res.status(200).json({
            message: 'Product updated successfully',
            product: updateProduct
        })
    } catch (error) {
        console.error("Update Product Error:", error);
        res.status(500).json({ message: "Failed to update product." });
    }
}

export const deleteProduct = async (req, res) => {
    try {
        const {id} = req.params

        const deletedProduct = await Product.findByIdAndDelete(id)

        if(!deletedProduct)
            return res.status(404).json({message: 'Product not found'})

        res.status(200).json({message: 'Product deleted successfully'})
    } catch (error) {
        console.error('Delete Product Error', error);
        res.status(500).json({message: 'Failed to delete product.'})        
    }
}