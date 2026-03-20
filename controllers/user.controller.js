import bcrypt from "bcrypt";
import User from "../models/user.model.js";
import jwt from "jsonwebtoken";

export const registerUser = async (req, res) => {
    try {
        const { name, email, phone, password } = req.body;

        if (!name || !email || !phone || !password) {
            return res.status(400).json({ message: "All fields are required!" });
        }

        const existingUser = await User.findOne({ email })
        if (existingUser) {
            return res.status(409).json({ message: 'User already exists!' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = new User({
            name, email, phone, password: hashedPassword
        })

        await newUser.save();

        const token = jwt.sign(
            { id: newUser._id },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        )

        res.cookie("token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        res.status(201).json({
            message: "User registered successfully!",
            token,
            user: {
                id: newUser._id,
                name: newUser.name,
                email: newUser.email,
            }
        })
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error, please try again later.', error: error?.message })
    }
}

export const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password)
            return res.status(400).json({ message: "Email and Password required!" });

        const user = await User.findOne({ email });

        if (!user)
            return res.status(401).json({ message: "User not found!" });

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch)
            return res.status(401).json({ message: "Invalid credentials!" })

        const token = jwt.sign(
            { id: user._id },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        )

        res.cookie("token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });


        res.status(200).json({
            message: "Login successful!",
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
            },
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error, please try again later.", error: error?.message });
    }
}

export const logoutUser = (req, res) => {
    try {
        res.clearCookie('token', {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
        });
        return res.status(200).json({ message: 'User logged out successfully!' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error, please try again later.', error: error?.message })
    }
}

export const updateProfile = async (req, res) => {
    try {
        const userId = req.user._id;
        const { name, phone, addresses } = req.body;

        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        if (name) user.name = name;
        if (phone) user.phone = phone;
        if (addresses) user.addresses = addresses;

        await user.save();

        res.status(200).json({
            message: "Profile updated successfully!",
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                addresses: user.addresses,
            }
        });


    } catch (error) {
        console.error("Update Profile Error:", error);
        res.status(500).json({ message: "Failed to update profile", error: error?.message });
    }
}

export const getUserProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select("-password");

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        res.status(200).json({
            success: true,
            user,
        });
    } catch (error) {
        console.error("Get Profile Error:", error);
        res.status(500).json({ message: "Failed to fetch profile", error: error?.message });
    }
}