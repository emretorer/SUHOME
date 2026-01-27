// server/src/routes/productRoutes.js
import { Router } from "express";

import {
  getAllProducts,
  updateProductStock,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
} from "../controllers/productController.js";

const router = Router();

router.get("/", getAllProducts);
router.post("/", createProduct);
router.put("/:id", updateProduct);
router.get("/:id", getProductById); 
router.put("/:id/stock", updateProductStock);
router.delete("/:id", deleteProduct);

export default router;
