import { Router } from "express";
import multer from "multer";
import fs from "fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getConversation,
  getConversationMessages,
  getCustomerWishlist,
  getCustomerProfile,
  getCustomerCart,
  claimConversation,
  unclaimConversation,
  identifyConversation,
  listConversations,
  postCustomerMessage,
  postSupportReply,
  deleteConversation,
  streamConversation,
  streamInbox,
} from "../controllers/supportController.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadDir = path.resolve(__dirname, "../../uploads/support");
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext);
    const safeName = base.replace(/\s+/g, "-").slice(0, 64);
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}-${safeName}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 4 },
});

const withAttachments = upload.array("attachments", 4);

const router = Router();

// Customer side
router.get("/conversation", getConversation);
router.post("/message", withAttachments, postCustomerMessage);

// Support agent side
router.get("/inbox", listConversations);
router.get("/inbox/stream", streamInbox);
router.get("/conversations/:conversation_id/messages", getConversationMessages);
router.get("/conversations/:conversation_id/stream", streamConversation);
router.get("/customers/:user_id/wishlist", getCustomerWishlist);
router.get("/customers/:user_id/profile", getCustomerProfile);
router.get("/customers/:user_id/cart", getCustomerCart);
router.post("/conversations/:conversation_id/claim", claimConversation);
router.post("/conversations/:conversation_id/unclaim", unclaimConversation);
router.post("/conversations/:conversation_id/identify", identifyConversation);
router.post("/conversations/:conversation_id/reply", withAttachments, postSupportReply);
router.delete("/conversations/:conversation_id", deleteConversation);

export default router;
