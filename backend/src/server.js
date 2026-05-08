import dotenv from "dotenv";
import express from "express";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";
import connectDB from "./config/database.js";
import app from "./app.js";
import userRouter from "./routes/authRoute.js";
import adminOnlyRouter from "./routes/adminOnlyRoute.js";

dotenv.config({ path: "./.env" });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json());
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "../../frontend")));

app.use("/api/auth", userRouter);
app.use("/api/admin", adminOnlyRouter);

connectDB();

app.listen(process.env)
// Local development only
if (process.env.NODE_ENV !== "production") {
    const PORT = process.env.PORT || 5500;
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}
export default app;