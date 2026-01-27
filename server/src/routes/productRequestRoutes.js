import { Router } from "express";

import {
  createProductRequest,
  getProductRequests,
  publishProductRequest,
} from "../controllers/productRequestController.js";

const router = Router();

router.get("/", getProductRequests);
router.post("/", createProductRequest);
router.put("/:id/publish", publishProductRequest);

export default router;
