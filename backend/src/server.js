// =====  GENERAL IMPORTS =====
import dotenv from "dotenv";
import express from "express";
import connectDB from "./config/database.js";
import app from "./app.js";
import cookieParser from "cookie-parser";
// |=====  GENERAL IMPORTS ===== END =====|

dotenv.config({path: './.env'});
app.use(express.json());
app.use(cookieParser());    
app.use(express.urlencoded({ extended: true }));

// |=====  ROUTER IMPORTS =====
import userRouter from "./routes/authRoute.js"
import adminOnlyRouter from "./routes/adminOnlyRoute.js";

// |=====  ROUTER IMPORTS ===== END =====|

app.use(express.static("../frontend"))
app.use("/api/auth", userRouter);
app.use("/api/admin", adminOnlyRouter);





const PORT = process.env.PORT || 5500;
const startServer = async ()=>{
    try{
        await connectDB();
        app.on("error", (error) =>{
            console.log("ERROR", error);
            throw error;
        });
        app.listen( PORT , ()=>{
            console.log(`Server is running on Port : ${PORT}`)
        });
    }catch(error){
        console.log("MongoDB connection failed!!", error);
    }
}
startServer();