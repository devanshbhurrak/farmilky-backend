
export const adminOnly = (req, res, next) => {
    if(req.user?.role !== "admin") {
        return res.status(403).json({message: 'Access denied. Admin only.'})
    }
    next();
}

export const deliveryPartnerOrAdmin = (req, res, next) => {
    const role = req.user?.role;
    if (role !== "admin" && role !== "delivery_partner" && role !== "delivery" && role !== "agent") {
        return res.status(403).json({ message: "Access denied. Delivery partner or admin only." });
    }
    next();
};