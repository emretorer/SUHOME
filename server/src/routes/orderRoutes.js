// server/src/routes/orderRoutes.js
import { Router } from "express";
import {
  checkout,
  getAllOrders,
  getOrderHistory,
  updateDeliveryStatus,
  cancelOrder,
  refundOrder,
} from "../controllers/orderController.js";



import { generateInvoice } from "../controllers/invoiceController.js";

const router = Router();

router.post("/checkout", checkout);
router.get("/", getAllOrders);
router.get("/history", getOrderHistory);
router.put("/:order_id/status", updateDeliveryStatus);
router.put("/:id/cancel", cancelOrder);
router.put("/:id/refund", refundOrder);
router.get("/:order_id/invoice", generateInvoice);

export default router;
