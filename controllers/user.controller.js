import bcrypt from "bcrypt";
import User from "../models/user.model.js";
import Order from "../models/order.model.js";
import Subscription from "../models/subscription.model.js";
import jwt from "jsonwebtoken";
import { getAuthCookieOptions, getClearCookieOptions } from "../utils/cookieOptions.js";

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

        res.cookie("token", token, getAuthCookieOptions());

        res.status(201).json({
            message: "User registered successfully!",
            token,
            user: {
                id: newUser._id,
                name: newUser.name,
                email: newUser.email,
                role: newUser.role,
            }
        })
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error, please try again later.', error: error?.message })
    }
}

export const createUserAdmin = async (req, res) => {
  try {
    const { name, email, phone, password, role, addresses, isActive, agentInfo } = req.body;

    if (!name || !email || !phone || !password) {
      return res.status(400).json({ message: "Name, email, phone, and password are required!" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: "User already exists!" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const resolvedRole = role || "customer";

    const userData = {
      name,
      email,
      phone,
      password: hashedPassword,
      role: resolvedRole,
      addresses: addresses || [],
      isActive: isActive ?? true,
      createdBy: req.user?._id || null,
    };

    if (resolvedRole === "agent") {
      userData.agentInfo = {
        joiningDate: agentInfo?.joiningDate || new Date(),
        vehicleType: agentInfo?.vehicleType || "",
        maxCapacity: agentInfo?.maxCapacity || 0,
        assignedArea: agentInfo?.assignedArea || null,
      };
    }

    const newUser = await User.create(userData);

    res.status(201).json({
      message: "User created successfully by admin!",
      user: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        phone: newUser.phone,
      },
    });
  } catch (error) {
    console.error("Create User Admin Error:", error);
    res.status(500).json({ message: "Server error, please try again later.", error: error?.message });
  }
};

export const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password)
            return res.status(400).json({ message: "Email and Password required!" });

        const user = await User.findOne({ email }).select('+password');

        if (!user) {
            console.warn(`[Auth] Failed login attempt: User not found (${email})`);
            return res.status(401).json({ message: "User not found!" });
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            console.warn(`[Auth] Failed login attempt: Invalid credentials for ${email}`);
            return res.status(401).json({ message: "Invalid credentials!" })
        }

        const token = jwt.sign(
            { id: user._id },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        )

        res.cookie("token", token, getAuthCookieOptions());


        res.status(200).json({
            message: "Login successful!",
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
            },
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error, please try again later.", error: error?.message });
    }
}

export const logoutUser = (req, res) => {
    try {
        res.clearCookie('token', getClearCookieOptions());
        return res.status(200).json({ message: 'User logged out successfully!' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error, please try again later.', error: error?.message })
    }
}

export const updateProfile = async (req, res) => {
    try {
        const userId = req.user._id;
        const { name, phone, addresses, deliveryPreferences } = req.body;

        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        if (name) user.name = name;
        if (phone) user.phone = phone;
        if (addresses) user.addresses = addresses;
        if (deliveryPreferences) user.deliveryPreferences = deliveryPreferences;

        await user.save();

        res.status(200).json({
            message: "Profile updated successfully!",
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                addresses: user.addresses,
                deliveryPreferences: user.deliveryPreferences,
                role: user.role,
            }
        });


    } catch (error) {
        console.error("Update Profile Error:", error);
        res.status(500).json({ message: "Failed to update profile", error: error?.message });
    }
}

export const getAllUsersAdmin = async (req, res) => {
  try {
    const { search, role, page, limit, skipEnrichment } = req.query;
    let query = {};
    if (role) query.role = role;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
      ];
    }

    let usersQuery = User.find(query).select("-password").sort({ createdAt: -1 });
    let total;

    if (role === "agent") {
      usersQuery = usersQuery.populate("agentInfo.assignedArea", "name");
    }

    if (page && limit) {
      const pageNum = parseInt(page, 10);
      const limitNum = parseInt(limit, 10);
      total = await User.countDocuments(query);
      usersQuery = usersQuery.skip((pageNum - 1) * limitNum).limit(limitNum);
    }

    const users = await usersQuery;

    if (skipEnrichment === "true") {
      const response = { users };
      if (page && limit) {
        response.total = total;
        response.page = parseInt(page, 10);
        response.limit = parseInt(limit, 10);
      }
      return res.status(200).json(response);
    }

    const enriched = await Promise.all(
      users.map(async (user) => {
        const [orderCount, subscriptionCount, totalSpent] = await Promise.all([
          Order.countDocuments({ userId: user._id }),
          Subscription.countDocuments({ userId: user._id }),
          Order.aggregate([
            { $match: { userId: user._id, orderStatus: "delivered" } },
            { $group: { _id: null, total: { $sum: "$totalAmount" } } },
          ]),
        ]);

        return {
          ...user.toObject(),
          orderCount,
          subscriptionCount,
          totalSpent: totalSpent[0]?.total || 0,
          pendingAmount: user.accountBalance || 0,
        };
      })
    );

    const response = { users: enriched };
    if (page && limit) {
      response.total = total;
      response.page = parseInt(page, 10);
      response.limit = parseInt(limit, 10);
    }
    res.status(200).json(response);
  } catch (error) {
    console.error("Get All Users Admin Error:", error);
    res.status(500).json({ message: "Failed to fetch users." });
  }
};

export const getUserByIdAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });

    const [recentOrders, subscriptions] = await Promise.all([
      Order.find({ userId: id }).populate("items.productId").sort({ createdAt: -1 }).limit(20),
      Subscription.find({ userId: id }).populate("productId", "name unit image price category"),
    ]);

    const totalOrderSpend = recentOrders
      .filter((o) => o.orderStatus === "delivered")
      .reduce((s, o) => s + (o.totalAmount || 0), 0);

    const totalSubscriptionSpend = subscriptions
      .reduce((s, sub) => s + (sub.pendingAmount || 0), 0);

    // In the new system, accountBalance is the true pending amount
    const pendingAmount = user.accountBalance || 0;

    res.status(200).json({
      user,
      recentOrders,
      subscriptions,
      totalOrderSpend,
      totalSubscriptionSpend,
      pendingAmount,
    });
  } catch (error) {
    console.error("Get User By Id Admin Error:", error);
    res.status(500).json({ message: "Failed to fetch user details." });
  }
};

export const updateUserAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, role, addresses, isActive, password, agentInfo } = req.body;

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (name) user.name = name;
    if (email) user.email = email;
    if (phone) user.phone = phone;
    if (role) user.role = role;
    if (addresses) user.addresses = addresses;
    if (isActive !== undefined) user.isActive = isActive;
    if (password) {
      user.password = await bcrypt.hash(password, 10);
    }

    if (agentInfo && user.role === "agent") {
      if (!user.agentInfo) user.agentInfo = {};
      if (agentInfo.joiningDate !== undefined) user.agentInfo.joiningDate = agentInfo.joiningDate;
      if (agentInfo.vehicleType !== undefined) user.agentInfo.vehicleType = agentInfo.vehicleType;
      if (agentInfo.maxCapacity !== undefined) user.agentInfo.maxCapacity = agentInfo.maxCapacity;
      if (agentInfo.assignedArea !== undefined) user.agentInfo.assignedArea = agentInfo.assignedArea;
    }

    user.updatedBy = req.user._id;
    await user.save();

    res.status(200).json({
      message: "User updated successfully by admin!",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
      },
    });
  } catch (error) {
    console.error("Update User Admin Error:", error);
    res.status(500).json({ message: "Server error", error: error?.message });
  }
};

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
