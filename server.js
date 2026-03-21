import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { connectDB } from './config/db.js'
import { getAllowedOrigins, validateEnv } from "./config/env.js";
import userRoutes from "./routes/user.routes.js"
import productRoutes from "./routes/product.routes.js";
import cartRoutes from "./routes/cart.routes.js";
import orderRoutes from "./routes/order.routes.js";
import subscriptionRoutes from "./routes/subscription.routes.js";
import invoiceRoutes from "./routes/invoice.routes.js";
import cronRoutes from "./routes/cron.routes.js";

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

        if (!origin || allowedOrigins.includes(origin)) {
            return callback(null, true);
        }

        return callback(new Error("Origin not allowed by CORS"));
    },
    credentials: true,
}))
app.use(helmet());
app.use(express.json());
app.use(cookieParser());

app.get("/", (req, res) => {
    res.send("Welcome to the Farmilky API!");
})
app.use("/api/user", userRoutes);
app.use("/api/products", productRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/order", orderRoutes);
app.use("/api/subscriptions", subscriptionRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/cron", cronRoutes);

if (process.env.NODE_ENV !== "production") {
    app.listen(PORT, () => {
        console.log(`Server is running or PORT:${PORT}`)
    })
}

export default app;
