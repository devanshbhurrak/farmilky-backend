import bcrypt from "bcrypt";
import User from "../models/user.model.js";
import Order from "../models/order.model.js";
import Subscription from "../models/subscription.model.js";
import Area from "../models/area.model.js";
import jwt from "jsonwebtoken";
import { getAuthCookieOptions, getClearCookieOptions } from "../utils/cookieOptions.js";

const syncAgentArea = async (agentId, areaId) => {
  const area = areaId ? await Area.findById(areaId) : null;
  if (areaId && !area) throw new Error("Area not found.");

  const agent = await User.findById(agentId);
  const prevAreaId = agent?.agentInfo?.assignedArea || agent?.assignedArea;

  if (prevAreaId && prevAreaId.toString() !== String(areaId)) {
    await Area.findByIdAndUpdate(prevAreaId, { assignedAgent: null });
  }

  if (area) {
    if (area.assignedAgent && area.assignedAgent.toString() !== String(agentId)) {
      await User.findByIdAndUpdate(area.assignedAgent, {
        assignedArea: null,
        "agentInfo.assignedArea": null,
      });
    }
    await Area.findByIdAndUpdate(area._id, { assignedAgent: agentId });
    await User.findByIdAndUpdate(agentId, {
      assignedArea: area._id,
      "agentInfo.assignedArea": area._id,
    });
  } else {
    await User.findByIdAndUpdate(agentId, {
      assignedArea: null,
      "agentInfo.assignedArea": null,
    });
  }
};

export const registerUser = async (req, res) => {
    try {
        const { name, email, phone, password, address } = req.body;

        if (!name || !phone || !password) {
            return res.status(400).json({ message: "Name, phone, and password are required!" });
        }

        if (!/^[6-9]\d{9}$/.test(phone)) {
            return res.status(400).json({ message: "Enter a valid 10-digit Indian mobile number." });
        }

        if (email && email.trim()) {
            const existingEmail = await User.findOne({ email });
            if (existingEmail) {
                return res.status(409).json({ message: "An account with this email already exists!" });
            }
        }

        const existingPhone = await User.findOne({ phone });
        if (existingPhone) {
            return res.status(409).json({ message: "An account with this phone number already exists!" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const userData = { name, phone, password: hashedPassword };
        if (email && email.trim()) userData.email = email.toLowerCase().trim();

        // Store optional address (with lat/lng) collected during sign-up
        if (address && typeof address === "object") {
            const { street, city, state, pincode, lat, lng, type } = address;
            const hasContent = street || city || state || pincode || lat || lng;
            if (hasContent) {
                userData.addresses = [{
                    street: street || "",
                    city: city || "",
                    state: state || "",
                    pincode: pincode ? Number(pincode) : undefined,
                    lat: lat ?? null,
                    lng: lng ?? null,
                    type: ["home", "work", "other"].includes(type) ? type : "home",
                }];
            }
        }

        const newUser = new User(userData);

        await newUser.save();

        const token = jwt.sign(
            { id: newUser._id },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        )

        res.cookie("token", token, getAuthCookieOptions());

        res.status(201).json({
            message: "User registered successfully!",
            user: {
                id: newUser._id,
                name: newUser.name,
                email: newUser.email,
                role: newUser.role,
            }
        })
    } catch (error) {
        console.error(error);
        if (error.code === 11000) {
            const field = Object.keys(error.keyPattern || {})[0];
            const value = error.keyValue?.[field];
            if (field === "email" && value != null) return res.status(409).json({ message: "An account with this email already exists!" });
            if (field === "phone") return res.status(409).json({ message: "An account with this phone number already exists!" });
        }
        res.status(500).json({ message: 'Server error, please try again later.' })
    }
}

export const createUserAdmin = async (req, res) => {
  try {
    const { name, email, phone, password, role, addresses, isActive, agentInfo } = req.body;

    if (!name || !phone || !password) {
      return res.status(400).json({ message: "Name, phone, and password are required!" });
    }

    if (!/^[6-9]\d{9}$/.test(phone)) {
      return res.status(400).json({ message: "Enter a valid 10-digit Indian mobile number." });
    }

    if (email && email.trim()) {
      const existingEmail = await User.findOne({ email });
      if (existingEmail) {
        return res.status(409).json({ message: "An account with this email already exists!" });
      }
    }

    const existingPhone = await User.findOne({ phone });
    if (existingPhone) {
      return res.status(409).json({ message: "An account with this phone number already exists!" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const resolvedRole = role || "customer";

    const userData = {
      name,
      phone,
      password: hashedPassword,
      role: resolvedRole,
      addresses: addresses || [],
      isActive: isActive ?? true,
      createdBy: req.user?._id || null,
    };
    if (email && email.trim()) userData.email = email.toLowerCase().trim();

    if (resolvedRole === "agent") {
      userData.agentInfo = {
        joiningDate: agentInfo?.joiningDate || new Date(),
        vehicleType: agentInfo?.vehicleType || "",
        maxCapacity: agentInfo?.maxCapacity || 0,
        assignedArea: agentInfo?.assignedArea || null,
      };
    }

    const newUser = await User.create(userData);

    if (resolvedRole === "agent" && agentInfo?.assignedArea) {
      await syncAgentArea(newUser._id, agentInfo.assignedArea);
    }

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
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0];
      const value = error.keyValue?.[field];
      if (field === "email" && value != null) return res.status(409).json({ message: "An account with this email already exists!" });
      if (field === "phone") return res.status(409).json({ message: "An account with this phone number already exists!" });
    }
    res.status(500).json({ message: "Server error, please try again later." });
  }
};

export const loginUser = async (req, res) => {
    try {
        const { identifier, password } = req.body;

        if (!identifier || !password)
            return res.status(400).json({ message: "Identifier and password are required!" });

        const isEmail = identifier.includes("@");
        const isPhone = /^[6-9]\d{9}$/.test(identifier);

        if (!isEmail && !isPhone)
            return res.status(400).json({ message: "Enter a valid email or 10-digit Indian mobile number." });

        const query = isEmail ? { email: identifier.toLowerCase().trim() } : { phone: identifier };
        const user = await User.findOne(query).select("+password");

        if (!user) {
            console.warn(`[Auth] Failed login attempt: User not found (${identifier})`);
            return res.status(401).json({ message: "Invalid credentials!" });
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            console.warn(`[Auth] Failed login attempt: Invalid password for ${identifier}`);
            return res.status(401).json({ message: "Invalid credentials!" });
        }

        const token = jwt.sign(
            { id: user._id },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        res.cookie("token", token, getAuthCookieOptions());

        res.status(200).json({
            message: "Login successful!",
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
            },
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error, please try again later." });
    }
}

export const logoutUser = (req, res) => {
    try {
        res.clearCookie('token', getClearCookieOptions());
        return res.status(200).json({ message: 'User logged out successfully!' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error, please try again later.' })
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
        if (phone) {
            if (!/^[6-9]\d{9}$/.test(phone)) {
                return res.status(400).json({ message: "Enter a valid 10-digit Indian mobile number." });
            }
            if (phone !== user.phone) {
                const existingPhone = await User.findOne({ phone, _id: { $ne: userId } });
                if (existingPhone) {
                    return res.status(409).json({ message: "This phone number is already in use by another account." });
                }
            }
            user.phone = phone;
        }
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
        res.status(500).json({ message: "Failed to update profile" });
    }
}

export const getAllUsersAdmin = async (req, res) => {
  try {
    const { search, role, sortBy, sortOrder, page, limit, skipEnrichment } = req.query;
    const { parsePagination, buildPaginationMeta, escapeRegex, buildSearchOr } = await import("../utils/pagination.js");
    const { page: p, limit: lim, skip, sort } = parsePagination(
      { page, limit, sortBy, sortOrder },
      { defaultLimit: 20, maxLimit: 100, defaultSort: { createdAt: -1 }, allowedSortFields: ["createdAt","name","accountBalance"] }
    );
    let query = {};
    if (role) query.role = role;
    const balance = req.query.balance || req.query.balanceFilter;
    if (balance === "due") query.accountBalance = { $gt: 0 };
    else if (balance === "advance") query.accountBalance = { $lt: 0 };
    else if (balance === "zero") query.accountBalance = 0;
    else if (balance === "nonzero") query.accountBalance = { $ne: 0 };
    if (req.query.isActive === "true") query.isActive = true;
    else if (req.query.isActive === "false") query.isActive = false;
    if (req.query.unassigned === "true") {
      query.$and = [...(query.$and || []), { $or: [{ "agentInfo.assignedArea": null }, { "agentInfo.assignedArea": { $exists: false } }, { assignedArea: null }, { assignedArea: { $exists: false } }] }];
    }
    if (search) {
      const escapedSearch = escapeRegex(search.trim());
      query.$or = buildSearchOr(escapedSearch, ["name","email","phone"]);
      // If $and already exists (unassigned), Mongo will AND them implicitly; keep both
    }

    let usersQuery = User.find(query).select("-password").sort(sort).skip(skip).limit(lim);
    if (role === "agent") {
      usersQuery = usersQuery.populate("agentInfo.assignedArea", "name");
    }

    const [users, total] = await Promise.all([usersQuery, User.countDocuments(query)]);

    if (skipEnrichment === "true") {
      return res.status(200).json({ users, ...buildPaginationMeta(total, p, lim) });
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

    res.status(200).json({ users: enriched, ...buildPaginationMeta(total, p, lim) });
  } catch (error) {
    console.error("Get All Users Admin Error:", error);
    res.status(500).json({ message: "Failed to fetch users." });
  }
};

export const getUserByIdAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { month, year } = req.query;

    const user = await User.findById(id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.role === "agent") {
      await user.populate("agentInfo.assignedArea", "name");
    }

    // Build order date filter when month/year are provided
    const orderFilter = { userId: id };
    if (month && year) {
      const m = parseInt(month) - 1;
      const y = parseInt(year);
      orderFilter.createdAt = { $gte: new Date(y, m, 1), $lt: new Date(y, m + 1, 1) };
    }

    const [recentOrders, subscriptions] = await Promise.all([
      Order.find(orderFilter)
        .populate("items.productId")
        .sort({ createdAt: -1 })
        .limit(month && year ? 200 : 20),
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
    if (email && email !== user.email) {
      const existing = await User.findOne({ email, _id: { $ne: id } });
      if (existing) return res.status(409).json({ message: "Email is already in use by another account." });
      user.email = email;
    }
    if (phone) {
      if (!/^[6-9]\d{9}$/.test(phone)) {
        return res.status(400).json({ message: "Enter a valid 10-digit Indian mobile number." });
      }
      if (phone !== user.phone) {
        const existingPhone = await User.findOne({ phone, _id: { $ne: id } });
        if (existingPhone) return res.status(409).json({ message: "Phone number is already in use by another account." });
      }
      user.phone = phone;
    }
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
      if (agentInfo.assignedArea !== undefined) {
        user.agentInfo.assignedArea = agentInfo.assignedArea || null;
        await syncAgentArea(id, agentInfo.assignedArea || null);
      }
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
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0];
      const value = error.keyValue?.[field];
      if (field === "email" && value != null) return res.status(409).json({ message: "Email is already in use by another account." });
      if (field === "phone") return res.status(409).json({ message: "Phone number is already in use by another account." });
    }
    res.status(500).json({ message: "Server error" });
  }
};

export const updateDeliveryConfig = async (req, res) => {
  try {
    const { assignedArea, deliverySequence } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found." });

    if (assignedArea !== undefined) {
      if (assignedArea) {
        const area = await Area.findById(assignedArea);
        if (!area) return res.status(404).json({ message: "Area not found." });
      }
      user.assignedArea = assignedArea || null;
    }
    if (deliverySequence !== undefined) user.deliverySequence = deliverySequence ?? null;

    await user.save();
    res.status(200).json({ message: "Delivery config updated.", user });
  } catch (error) {
    console.error("Update Delivery Config Error:", error);
    res.status(500).json({ message: "Failed to update delivery config." });
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
        res.status(500).json({ message: "Failed to fetch profile" });
    }
}
