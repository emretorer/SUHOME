import { Router } from "express";
import {
  createDiscount,
  updateProductPrice,
  updateProductCost,
  getProductCost,
  getInvoicesByDate,
  getProfitReport,
  getReturnRequests,
  updateReturnRequestStatus,
} from "../controllers/salesController.js";

const router = Router();

router.post("/discounts/apply", createDiscount);
router.put("/products/:id/price", updateProductPrice);
router.put("/products/:id/cost", updateProductCost);
router.get("/products/:id/cost", getProductCost);
router.get("/invoices", getInvoicesByDate);
router.get("/reports/profit", getProfitReport);
router.get("/return-requests", getReturnRequests);
router.put("/return-requests/:return_id/status", updateReturnRequestStatus);

export default router;
