import { Router } from "express";
import {
  addComment,
  canReview,
  listComments,
  getUserComments,
  approveComment,
  rejectComment,
  listPendingForManager,
} from "../controllers/commentController.js";

const router = Router();

router.get("/can/:productId", canReview);
router.get("/user", getUserComments);
router.get("/pending", listPendingForManager);
router.get("/:productId", listComments);
router.post("/", addComment);
router.post("/:commentId/approve", approveComment);
router.post("/:commentId/reject", rejectComment);

export default router;
