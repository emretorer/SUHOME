import { Router } from "express";
import {
  getMainCategories,
  createMainCategory,
  deleteMainCategory,
} from "../controllers/mainCategoryController.js";

const router = Router();

router.get("/", getMainCategories);
router.post("/", createMainCategory);
router.delete("/:id", deleteMainCategory);

export default router;
