// src/routes/cartRoutes.js
import { Router } from "express";
import {
  getCart,
  addToCart,
  deleteCartItem,
} from "../controllers/cartController.js";

const router = Router();

router.get("/", getCart);          // GET /api/cart
router.post("/", addToCart);       // POST /api/cart
router.delete("/:id", deleteCartItem); // DELETE /api/cart/:id

export default router;
