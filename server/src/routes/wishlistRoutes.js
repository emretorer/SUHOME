import { Router } from "express";
import {
  addWishlistItem,
  getWishlist,
  removeWishlistItem,
} from "../controllers/wishlistController.js";

const router = Router();

router.get("/", getWishlist);
router.post("/", addWishlistItem);
router.delete("/:product_id", removeWishlistItem);

export default router;
