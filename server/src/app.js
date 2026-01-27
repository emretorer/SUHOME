import express from "express";
import cors from "cors";
import fs from "fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env from server/.env if present (even in production) so Docker builds pick it up
const envPath = path.resolve(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  const { config } = await import("dotenv");
  config({ path: envPath });
}

const productRoutes = (await import("./routes/productRoutes.js")).default;
const cartRoutes = (await import("./routes/cartRoutes.js")).default;
const orderRoutes = (await import("./routes/orderRoutes.js")).default;
const supportRoutes = (await import("./routes/supportRoutes.js")).default;
const authRoutes = (await import("./routes/authRoutes.js")).default;
const commentRoutes = (await import("./routes/commentRoutes.js")).default;
const salesRoutes = (await import("./routes/salesRoutes.js")).default;
const paymentRoutes = (await import("./routes/paymentRoutes.js")).default;
const userRoutes = (await import("./routes/userRoutes.js")).default;
const wishlistRoutes = (await import("./routes/wishlistRoutes.js")).default;
const categoryRoutes = (await import("./routes/categoryRoutes.js")).default;
const mainCategoryRoutes = (await import("./routes/mainCategoryRoutes.js")).default;
const returnRoutes = (await import("./routes/returnRoutes.js")).default;
const productRequestRoutes = (await import("./routes/productRequestRoutes.js")).default;
const dbModule = await import("./db.js");
const db = dbModule.default; // DB bağlantısı burada load ediliyor


const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const uploadsRoot = path.resolve(__dirname, "../uploads");
fs.mkdirSync(uploadsRoot, { recursive: true });
app.use("/uploads", express.static(uploadsRoot));

// API ROUTES (keep under /api to avoid SPA clashes)
app.use("/api/products", productRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/support", supportRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/comments", commentRoutes);
app.use("/api/sales", salesRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/users", userRoutes);
app.use("/api/wishlist", wishlistRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/main-categories", mainCategoryRoutes);
app.use("/api/returns", returnRoutes);
app.use("/api/product-requests", productRequestRoutes);

// Static serve for built client
const publicDir = path.resolve(__dirname, "../public");
const indexPath = path.join(publicDir, "index.html");
app.use(express.static(publicDir));

// SPA fallback (Express 5 compatible, ignore /api/*)
app.get(/^(?!\/api\/).*/, (req, res) => {
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  res.status(404).send("Not Found");
});

// PORT (Cloud Run provides PORT)
const PORT = process.env.PORT || 8080;

// SERVER START
app.listen(PORT, () => {
  console.log(`🚀 Server çalışıyor → http://localhost:${PORT}`);
});
