import jwt from "jsonwebtoken";
import User from "../models/user.model.js";

export const authMiddleware = async (req, res, next) => {
  try {
    const token =
      req.cookies?.token || req.header("Authorization")?.replace("Bearer ", "");

    if (!token)
      return res.status(401).json({ message: "Access denied. No token provided." });
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id).select("-password");
    if (!user)
      return res.status(404).json({ message: "User not found." });

    req.user = user;
    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Token expired. Please login again." });
    }
    console.error("Auth Middleware Error:", error);
    res.status(401).json({ message: "Unauthorized or invalid token." });
  }
};
