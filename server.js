import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { connectDB } from './config/db.js'
import { getAllowedOrigins, validateEnv } from "./config/env.js";
import userRoutes from "./routes/user.routes.js"
import productRoutes from "./routes/product.routes.js";
import cartRoutes from "./routes/cart.routes.js";
import orderRoutes from "./routes/order.routes.js";
import subscriptionRoutes from "./routes/subscription.routes.js";
import cronRoutes from "./routes/cron.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import holidayRoutes from "./routes/holiday.routes.js";
import complaintRoutes from "./routes/complaint.routes.js";
import areaRoutes from "./routes/area.routes.js";
import agentRoutes from "./routes/agent.routes.js";
import deliveryManifestRoutes from "./routes/deliveryManifest.routes.js";
import returnRoutes from "./routes/return.routes.js";
import paymentRoutes from "./routes/payment.routes.js";
import contactRoutes from "./routes/contact.routes.js";

import initScheduler from "./services/scheduler.js";

dotenv.config()
validateEnv();

const app = express();
connectDB()
const PORT = process.env.PORT || 4000

if (process.env.ENABLE_LOCAL_SCHEDULER === "true" && process.env.NODE_ENV !== "production") {
    initScheduler();
}

app.use(cors({
    origin: (origin, callback) => {
        const allowedOrigins = getAllowedOrigins();
        const allowWildcard = process.env.NODE_ENV !== "production" && allowedOrigins.includes("*");

        if (!origin || allowWildcard || allowedOrigins.includes(origin)) {
            return callback(null, true);
        }

        return callback(new Error("Origin not allowed by CORS"));
    },
    credentials: true,
}))
app.use(helmet());
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser());

// Rate Limiting for Auth
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: { message: "Too many requests from this IP, please try again after 15 minutes" }
});

// Rate Limiting for public contact form (stricter — creates DB documents)
const contactLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // 5 submissions per IP per hour
    message: { message: "Too many messages sent. Please try again later." }
});

app.get("/", (req, res) => {
    res.send("Welcome to the Farmilky API!");
})
app.use("/api/user", authLimiter, userRoutes);
app.use("/api/products", productRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/order", orderRoutes);
app.use("/api/subscriptions", subscriptionRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/cron", cronRoutes);
app.use("/api/holidays", holidayRoutes);
app.use("/api/complaints", complaintRoutes);
app.use("/api/areas", areaRoutes);
app.use("/api/agents", agentRoutes);
app.use("/api/manifests", deliveryManifestRoutes);
app.use("/api/returns", returnRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/contact", contactLimiter, contactRoutes);

// Global Error Handler
app.use((err, req, res, next) => {
    console.error(`[Error] ${req.method} ${req.url}:`, err.stack);
    res.status(err.status || 500).json({
        message: err.message || "Internal Server Error",
    });
});

if (process.env.NODE_ENV !== "production") {
    app.listen(PORT, () => {
        console.log(`Server is running or PORT:${PORT}`)
    })
}

export default app;
