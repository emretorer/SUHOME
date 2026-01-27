import { Router } from "express";
import { login, register, forgotPassword, resetPassword } from "../controllers/authController.js";
import { rateLimit } from "../middleware/rateLimit.js";

const router = Router();
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: "Too many auth attempts, please try again later.",
});

router.post("/register", authLimiter, register);
router.post("/login", authLimiter, login);
router.post("/forgot", authLimiter, forgotPassword);
router.post("/reset", authLimiter, resetPassword);

export default router;
