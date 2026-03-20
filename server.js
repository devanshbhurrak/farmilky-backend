import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import cookieParser from "cookie-parser";
import { connectDB } from './config/db.js'
import userRoutes from "./routes/user.routes.js"
import productRoutes from "./routes/product.routes.js";
import cartRoutes from "./routes/cart.routes.js";
import orderRoutes from "./routes/order.routes.js";
import subscriptionRoutes from "./routes/subscription.routes.js";
import invoiceRoutes from "./routes/invoice.routes.js";

import initScheduler from "./services/scheduler.js";

dotenv.config()

const app = express();
connectDB()
initScheduler();
const PORT = process.env.PORT || 4000

app.use(cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
}))
app.use(express.json());
app.use(cookieParser());

app.use("/api/user", userRoutes);
app.use("/api/products", productRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/order", orderRoutes);
app.use("/api/subscriptions", subscriptionRoutes);
app.use("/api/invoices", invoiceRoutes);

if (process.env.NODE_ENV !== "production") {
    app.listen(PORT, () => {
        console.log(`Server is running or PORT:${PORT}`)
    })
}

export default app;