import express from "express";
import { getUserProfile, updateUserAddress, updateUserProfile } from "../controllers/userController.js";

const router = express.Router();

router.get("/:userId", getUserProfile);
router.patch("/:userId/address", updateUserAddress);
router.patch("/:userId/profile", updateUserProfile);

export default router;
