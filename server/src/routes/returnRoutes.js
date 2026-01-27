import { Router } from "express";
import { createReturnRequest, getUserReturnRequests } from "../controllers/returnController.js";

const router = Router();

router.post("/", createReturnRequest);
router.get("/", getUserReturnRequests);

export default router;
