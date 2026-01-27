import db from "../db.js";
import { sendMail } from "../utils/mailer.js";
import {
  broadcastConversationMessage,
  broadcastInboxUpdate,
  registerConversationStream,
  registerInboxStream,
} from "../utils/supportStream.js";

const DEFAULT_USER_ID = Number(process.env.DEFAULT_USER_ID || 1);
const DEFAULT_AGENT_ID = Number(
  process.env.SUPPORT_USER_ID || process.env.DEFAULT_AGENT_ID || DEFAULT_USER_ID + 1 || 2
);
const SUPPORT_INBOX_EMAIL =
  process.env.SUPPORT_INBOX_EMAIL || process.env.SMTP_FROM || process.env.SMTP_USER;

function groupAttachments(rows) {
  const map = new Map();
  (rows || []).forEach((row) => {
    const bucket = map.get(row.message_id) || [];
    bucket.push({
      id: row.attachment_id,
      file_name: row.file_name,
      mime_type: row.mime_type,
      url: row.url,
      uploaded_at: row.uploaded_at,
    });
    map.set(row.message_id, bucket);
  });
  return map;
}

function fetchAttachmentsForMessages(messageIds, callback) {
  if (!Array.isArray(messageIds) || messageIds.length === 0) {
    return callback(null, new Map());
  }
  const sql = `
    SELECT attachment_id, message_id, file_name, mime_type, url, uploaded_at
    FROM support_attachments
    WHERE message_id IN (?)
    ORDER BY uploaded_at ASC
  `;
  db.query(sql, [messageIds], (err, rows) => {
    if (err) return callback(err);
    callback(null, groupAttachments(rows));
  });
}

function saveAttachments(files, messageId) {
  if (!Array.isArray(files) || files.length === 0) {
    return Promise.resolve([]);
  }
  const insertSql = `
    INSERT INTO support_attachments (message_id, file_name, mime_type, url)
    VALUES (?, ?, ?, ?)
  `;

  const attachments = [];
  return Promise.all(
    files.map(
      (file) =>
        new Promise((resolve, reject) => {
          const url = `/uploads/support/${file.filename}`;
          db.query(insertSql, [messageId, file.originalname, file.mimetype, url], (err, result) => {
            if (err) return reject(err);
            attachments.push({
              id: result.insertId,
              file_name: file.originalname,
              mime_type: file.mimetype,
              url,
            });
            resolve();
          });
        })
    )
  ).then(() => attachments);
}

function pickUserId(rawId) {
  const asNumber = Number(rawId);
  if (Number.isFinite(asNumber) && asNumber > 0) return asNumber;
  return DEFAULT_USER_ID;
}

function pickAgentId(rawId) {
  const asNumber = Number(rawId);
  if (Number.isFinite(asNumber) && asNumber > 0) return asNumber;
  return DEFAULT_AGENT_ID;
}

function maybeUpdateUserName(userId, currentName, nextName, callback) {
  const trimmed = nextName && String(nextName).trim();
  if (!trimmed) return callback();
  const normalizedCurrent = (currentName || "").trim();
  const lowerCurrent = normalizedCurrent.toLowerCase();
  const isPlaceholder =
    !normalizedCurrent || ["guest", "user", "demo user"].includes(lowerCurrent);
  if (!isPlaceholder || normalizedCurrent === trimmed) {
    return callback();
  }
  const updateSql = "UPDATE users SET full_name = ? WHERE user_id = ?";
  db.query(updateSql, [trimmed, userId], (err) => {
    if (err) {
      console.error("User name update failed:", err);
    }
    callback();
  });
}

function ensureUser({ user_id, email, name }, callback) {
  const numericId = Number(user_id);
  if (Number.isFinite(numericId) && numericId > 0) {
    const findByIdSql = "SELECT user_id, full_name FROM users WHERE user_id = ?";
    return db.query(findByIdSql, [numericId], (idErr, idRows) => {
      if (idErr) {
        console.error("User lookup failed:", idErr);
        return callback(idErr);
      }
      if (idRows.length > 0) {
        return maybeUpdateUserName(numericId, idRows[0].full_name, name, () =>
          callback(null, numericId)
        );
      }
      return ensureUser({ user_id: null, email, name }, callback);
    });
  }

  const safeEmail =
    email && String(email).includes("@")
      ? String(email)
      : `guest-${Math.random().toString(16).slice(2)}@chat.local`;
  const displayName =
    name && String(name).trim().length > 0 ? String(name).trim() : "Guest";

  const findSql = "SELECT user_id, full_name FROM users WHERE email = ?";
  db.query(findSql, [safeEmail], (findErr, rows) => {
    if (findErr) {
      console.error("User lookup failed:", findErr);
      return callback(findErr);
    }
    if (rows.length > 0) {
      const existing = rows[0];
      return maybeUpdateUserName(existing.user_id, existing.full_name, name, () =>
        callback(null, existing.user_id)
      );
    }

    const insertSql = `
      INSERT INTO users (full_name, email, password_hash)
      VALUES (?, ?, 'support-auto')
    `;
    db.query(insertSql, [displayName, safeEmail], (insErr, result) => {
      if (insErr) {
        console.error("User create failed:", insErr);
        return callback(insErr);
      }
      callback(null, result.insertId);
    });
  });
}

function ensureConversation(userId, orderId, callback) {
  const findSql = `
    SELECT conversation_id, status
    FROM support_conversations
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `;

  db.query(findSql, [userId], (err, rows) => {
    if (err) {
      console.error("Support conversation lookup failed:", err);
      return callback(err);
    }

    if (rows.length > 0) {
      const { conversation_id } = rows[0];
      return callback(null, conversation_id, false);
    }

    const insertSql = `
      INSERT INTO support_conversations (user_id, order_id, status, created_at)
      VALUES (?, ?, 'open', NOW())
    `;
    db.query(insertSql, [userId, orderId || null], (insertErr, result) => {
      if (insertErr) {
        console.error("Support conversation could not be created:", insertErr);
        return callback(insertErr);
      }
      callback(null, result.insertId, true);
    });
  });
}

function mapMessages(rows, userId, attachmentMap = new Map()) {
  return rows.map((row) => ({
    id: row.message_id,
    text: row.message_text,
    sender_id: row.sender_id,
    from: row.sender_id === userId ? "customer" : "support",
    timestamp: row.created_at,
    is_read_by_support: row.is_read_by_support ?? 0,
    attachments: attachmentMap.get(row.message_id) || [],
  }));
}

export function streamConversation(req, res) {
  const conversationId = Number(req.params.conversation_id);
  if (!conversationId) {
    return res.status(400).json({ error: "conversation_id zorunlu" });
  }
  registerConversationStream(conversationId, req, res);
}

export function streamInbox(req, res) {
  registerInboxStream(req, res);
}

export function getConversation(req, res) {
  const orderId = req.query.order_id ? Number(req.query.order_id) : null;
  const incomingUserId = req.query.user_id;
  const { email, name } = req.query;

  ensureUser({ user_id: incomingUserId, email, name }, (userErr, userId) => {
    if (userErr) {
      return res.status(500).json({ error: "Kullanıcı oluşturulamadı" });
    }

    ensureConversation(userId, orderId, (convErr, conversationId, created) => {
      if (convErr) {
        return res.status(500).json({ error: "Destek kaydı açılamadı" });
      }
      if (created) {
        broadcastInboxUpdate({ type: "created", conversation_id: conversationId, user_id: userId });
      }

      const messagesSql = `
        SELECT message_id, sender_id, message_text, created_at, is_read_by_support
        FROM support_messages
        WHERE conversation_id = ?
        ORDER BY created_at ASC
      `;

      db.query(messagesSql, [conversationId], (msgErr, rows) => {
        if (msgErr) {
          console.error("Support messages fetch failed:", msgErr);
          return res.status(500).json({ error: "Mesajlar alınamadı" });
        }

        const messageIds = rows.map((row) => row.message_id);
        fetchAttachmentsForMessages(messageIds, (attErr, attachmentMap) => {
          if (attErr) {
            console.error("Support attachments fetch failed:", attErr);
            return res.status(500).json({ error: "Mesajlar alınamadı" });
          }
          res.json({
            conversation_id: conversationId,
            user_id: userId,
            order_id: orderId,
            messages: mapMessages(rows, userId, attachmentMap),
          });
        });
      });
    });
  });
}

export function postCustomerMessage(req, res) {
  const orderId = req.body.order_id ? Number(req.body.order_id) : null;
  const { text, email, name } = req.body;
  const files = Array.isArray(req.files) ? req.files : [];
  const trimmedText = text && typeof text === "string" ? text.trim() : "";

  if (!trimmedText && files.length === 0) {
    return res.status(400).json({ error: "Mesaj veya dosya ekleyin" });
  }

  ensureUser({ user_id: req.body.user_id, email, name }, (userErr, userId) => {
    if (userErr) {
      return res.status(500).json({ error: "Kullanıcı oluşturulamadı" });
    }

    ensureConversation(userId, orderId, (convErr, conversationId) => {
      if (convErr) {
        return res.status(500).json({ error: "Destek kaydı açılamadı" });
      }

      const insertSql = `
        INSERT INTO support_messages (conversation_id, sender_id, message_text, created_at)
        VALUES (?, ?, ?, NOW())
      `;

      const messageText = trimmedText || "Dosya eklendi";

      db.query(insertSql, [conversationId, userId, messageText], (msgErr, result) => {
        if (msgErr) {
          console.error("Support message insert failed:", msgErr);
          return res.status(500).json({ error: "Mesaj kaydedilemedi" });
        }

        const finalize = (attachments = []) => {
          const messagePayload = {
            id: result.insertId,
            text: messageText,
            sender_id: userId,
            from: "customer",
            timestamp: new Date().toISOString(),
            attachments,
          };

          res.json({
            conversation_id: conversationId,
            message: messagePayload,
            user_id: userId,
          });

          broadcastConversationMessage(conversationId, messagePayload);
          broadcastInboxUpdate({ type: "message", conversation_id: conversationId });

          // Arka planda destek ekibine e-posta bildirimi gönder.
          if (SUPPORT_INBOX_EMAIL) {
            const attachmentLine = attachments.length
              ? `<p><strong>Attachments:</strong> ${attachments.map((a) => a.file_name).join(", ")}</p>`
              : "";
            sendMail({
              to: SUPPORT_INBOX_EMAIL,
              subject: `New support message #${conversationId}`,
              html: `
                <p><strong>User ID:</strong> ${userId}</p>
                ${email ? `<p><strong>Email:</strong> ${email}</p>` : ""}
                ${orderId ? `<p><strong>Order:</strong> ${orderId}</p>` : ""}
                <p><strong>Message:</strong></p>
                <p>${messageText}</p>
                ${attachmentLine}
              `,
            }).catch((err) => console.error("Support email failed:", err));
          }
        };

        saveAttachments(files, result.insertId)
          .then((attachments) => finalize(attachments))
          .catch((err) => {
            console.error("Support attachments save failed:", err);
            finalize([]);
          });
      });
    });
  });
}

export function listConversations(req, res) {
  const sql = `
    SELECT 
      sc.conversation_id,
      sc.user_id,
      sc.order_id,
      sc.assigned_user_id,
      sc.status,
      sc.created_at,
      u.full_name AS customer_name,
      u.email AS customer_email,
      au.full_name AS assigned_agent_name,
      au.email AS assigned_agent_email,
      (
        SELECT message_text FROM support_messages sm 
        WHERE sm.conversation_id = sc.conversation_id
        ORDER BY sm.created_at DESC
        LIMIT 1
      ) AS last_message,
      (
        SELECT created_at FROM support_messages sm 
        WHERE sm.conversation_id = sc.conversation_id
        ORDER BY sm.created_at DESC
        LIMIT 1
      ) AS last_message_at,
      (
        SELECT COUNT(*) FROM support_messages sm
        WHERE sm.conversation_id = sc.conversation_id
          AND sm.sender_id = sc.user_id
          AND sm.is_read_by_support = 0
      ) AS unread_count
    FROM support_conversations sc
    LEFT JOIN users u ON u.user_id = sc.user_id
    LEFT JOIN users au ON au.user_id = sc.assigned_user_id
    ORDER BY last_message_at DESC, sc.created_at DESC
  `;

  db.query(sql, (err, rows) => {
    if (err) {
      console.error("Support conversations fetch failed:", err);
      return res.status(500).json({ error: "Konuşmalar alınamadı" });
    }

    res.json(
      rows.map((row) => ({
        id: row.conversation_id,
        user_id: row.user_id,
        order_id: row.order_id,
        assigned_agent_id: row.assigned_user_id ?? null,
        assigned_agent_name: row.assigned_agent_name || null,
        assigned_agent_email: row.assigned_agent_email || null,
        status: row.status,
        created_at: row.created_at,
        customer_name: row.customer_name || `User #${row.user_id}`,
        customer_email: row.customer_email || null,
        last_message: row.last_message || "No message yet",
        last_message_at: row.last_message_at || row.created_at,
        unread_count: Number(row.unread_count) || 0,
      }))
    );
  });
}

export function deleteConversation(req, res) {
  const conversationId = Number(req.params.conversation_id);
  if (!conversationId) {
    return res.status(400).json({ error: "conversation_id zorunlu" });
  }

  const deleteMessagesSql = "DELETE FROM support_messages WHERE conversation_id = ?";
  const deleteConversationSql = "DELETE FROM support_conversations WHERE conversation_id = ?";

  db.query(deleteMessagesSql, [conversationId], (msgErr) => {
    if (msgErr) {
      console.error("Support messages delete failed:", msgErr);
      return res.status(500).json({ error: "Mesajlar silinemedi" });
    }

    db.query(deleteConversationSql, [conversationId], (convErr, result) => {
      if (convErr) {
        console.error("Support conversation delete failed:", convErr);
        return res.status(500).json({ error: "Konuşma silinemedi" });
      }
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: "Konuşma bulunamadı" });
      }
      broadcastInboxUpdate({ type: "deleted", conversation_id: conversationId });
      return res.json({ success: true });
    });
  });
}

export function getConversationMessages(req, res) {
  const conversationId = Number(req.params.conversation_id);
  if (!conversationId) {
    return res.status(400).json({ error: "conversation_id zorunlu" });
  }

  const sqlMeta = `
    SELECT conversation_id, user_id, order_id
    FROM support_conversations
    WHERE conversation_id = ?
  `;

  db.query(sqlMeta, [conversationId], (metaErr, metaRows) => {
    if (metaErr) {
      console.error("Support conversation meta fetch failed:", metaErr);
      return res.status(500).json({ error: "Konuşma okunamadı" });
    }
    if (metaRows.length === 0) {
      return res.status(404).json({ error: "Konuşma bulunamadı" });
    }

    const conversation = metaRows[0];

    const sqlMessages = `
      SELECT message_id, sender_id, message_text, created_at, is_read_by_support
      FROM support_messages
      WHERE conversation_id = ?
      ORDER BY created_at ASC
    `;

    const markReadSql = `
      UPDATE support_messages
      SET is_read_by_support = 1
      WHERE conversation_id = ?
        AND sender_id = ?
        AND is_read_by_support = 0
    `;

    db.query(markReadSql, [conversationId, conversation.user_id], (markErr) => {
      if (markErr) {
        console.error("Support read flag update failed:", markErr);
      }
    });

    db.query(sqlMessages, [conversationId], (err, rows) => {
      if (err) {
        console.error("Support messages fetch failed:", err);
        return res.status(500).json({ error: "Mesajlar okunamadı" });
      }

      const messageIds = rows.map((row) => row.message_id);
      fetchAttachmentsForMessages(messageIds, (attErr, attachmentMap) => {
        if (attErr) {
          console.error("Support attachments fetch failed:", attErr);
          return res.status(500).json({ error: "Mesajlar okunamadı" });
        }

        res.json({
          conversation_id: conversationId,
          user_id: conversation.user_id,
          order_id: conversation.order_id,
          messages: mapMessages(rows, conversation.user_id, attachmentMap),
        });
      });
    });
  });
}

export function getCustomerWishlist(req, res) {
  const userId = Number(req.params.user_id);
  if (!userId) {
    return res.status(400).json({ error: "user_id zorunlu" });
  }

  const sql = `
    SELECT
      wi.wishlist_item_id,
      wi.added_at,
      p.product_id,
      p.product_name,
      p.product_image,
      p.product_price
    FROM wishlists w
    JOIN wishlist_items wi ON wi.wishlist_id = w.wishlist_id
    LEFT JOIN products p ON p.product_id = wi.product_id
    WHERE w.user_id = ?
    ORDER BY wi.added_at DESC
  `;

  db.query(sql, [userId], (err, rows) => {
    if (err) {
      console.error("Wishlist fetch failed:", err);
      return res.status(500).json({ error: "Wishlist alnamad" });
    }

    res.json(
      rows.map((row) => ({
        id: row.wishlist_item_id,
        product_id: row.product_id,
        name: row.product_name || `Product #${row.product_id}`,
        image: row.product_image || null,
        price: Number(row.product_price) || null,
        added_at: row.added_at,
      }))
    );
  });
}

export function getCustomerProfile(req, res) {
  const userId = Number(req.params.user_id);
  if (!userId) {
    return res.status(400).json({ error: "user_id zorunlu" });
  }

  const sql = `
    SELECT user_id, full_name, email, home_address, tax_id
    FROM users
    WHERE user_id = ?
    LIMIT 1
  `;

  db.query(sql, [userId], (err, rows) => {
    if (err) {
      console.error("Customer profile fetch failed:", err);
      return res.status(500).json({ error: "Profile could not be loaded" });
    }
    if (!rows.length) {
      return res.status(404).json({ error: "User not found" });
    }
    const row = rows[0];
    return res.json({
      id: row.user_id,
      name: row.full_name || "",
      email: row.email || "",
      address: row.home_address || "",
      taxId: row.tax_id || "",
    });
  });
}

export function getCustomerCart(req, res) {
  const userId = Number(req.params.user_id);
  if (!userId) {
    return res.status(400).json({ error: "user_id zorunlu" });
  }

  const sql = `
    SELECT 
      ci.cart_item_id,
      ci.cart_id,
      ci.product_id,
      ci.quantity,
      ci.unit_price,
      p.product_name,
      p.product_image,
      p.product_price
    FROM carts c
    JOIN cart_items ci ON ci.cart_id = c.cart_id
    LEFT JOIN products p ON p.product_id = ci.product_id
    WHERE c.user_id = ?
    ORDER BY ci.cart_item_id ASC
  `;

  db.query(sql, [userId], (err, rows) => {
    if (err) {
      console.error("Customer cart fetch failed:", err);
      return res.status(500).json({ error: "Cart could not be loaded" });
    }
    const items = (rows || []).map((row) => {
      const price = Number(row.unit_price ?? row.product_price ?? 0);
      return {
        id: row.cart_item_id,
        product_id: row.product_id,
        name: row.product_name || `Product #${row.product_id}`,
        image: row.product_image || null,
        quantity: Number(row.quantity || 0),
        price,
        line_total: price * Number(row.quantity || 0),
      };
    });
    const total = items.reduce((sum, item) => sum + item.line_total, 0);
    return res.json({ items, total });
  });
}

export function claimConversation(req, res) {
  const conversationId = Number(req.params.conversation_id);
  const agentId = pickAgentId(req.body?.agent_id);
  if (!conversationId) {
    return res.status(400).json({ error: "conversation_id zorunlu" });
  }

  const selectSql = `
    SELECT assigned_user_id, status
    FROM support_conversations
    WHERE conversation_id = ?
    LIMIT 1
  `;

  db.query(selectSql, [conversationId], (findErr, rows) => {
    if (findErr) {
      console.error("Support claim lookup failed:", findErr);
      return res.status(500).json({ error: "Konuşma okunamadı" });
    }
    if (!rows.length) {
      return res.status(404).json({ error: "Konuşma bulunamadı" });
    }

    const current = rows[0];
    if (current.status === "closed") {
      return res.status(400).json({ error: "Konuşma kapalı" });
    }
    if (current.assigned_user_id && Number(current.assigned_user_id) !== Number(agentId)) {
      return res.status(409).json({ error: "Konuşma başka bir agente atanmış" });
    }

    const updateSql = `
      UPDATE support_conversations
      SET status = 'pending', assigned_user_id = ?
      WHERE conversation_id = ?
    `;

    db.query(updateSql, [agentId, conversationId], (err, result) => {
      if (err) {
        console.error("Support claim failed:", err);
        return res.status(500).json({ error: "KonuŸma gncellenemedi" });
      }
      if (!result.affectedRows) {
        return res.status(404).json({ error: "KonuŸma bulunamad" });
      }
      broadcastInboxUpdate({
        type: "status",
        conversation_id: conversationId,
        status: "pending",
        assigned_user_id: agentId,
      });
      return res.json({
        success: true,
        conversation_id: conversationId,
        status: "pending",
        assigned_user_id: agentId,
      });
    });
  });
}

export function unclaimConversation(req, res) {
  const conversationId = Number(req.params.conversation_id);
  const agentId = pickAgentId(req.body?.agent_id);
  if (!conversationId) {
    return res.status(400).json({ error: "conversation_id zorunlu" });
  }

  const selectSql = `
    SELECT assigned_user_id, status
    FROM support_conversations
    WHERE conversation_id = ?
    LIMIT 1
  `;

  db.query(selectSql, [conversationId], (findErr, rows) => {
    if (findErr) {
      console.error("Support unclaim lookup failed:", findErr);
      return res.status(500).json({ error: "Konuşma okunamadı" });
    }
    if (!rows.length) {
      return res.status(404).json({ error: "Konuşma bulunamadı" });
    }

    const current = rows[0];
    if (current.assigned_user_id && Number(current.assigned_user_id) !== Number(agentId)) {
      return res.status(403).json({ error: "Konuşma başka bir agente atanmış" });
    }

    const updateSql = `
      UPDATE support_conversations
      SET status = 'open', assigned_user_id = NULL
      WHERE conversation_id = ?
    `;

    db.query(updateSql, [conversationId], (err, result) => {
      if (err) {
        console.error("Support unclaim failed:", err);
        return res.status(500).json({ error: "KonuYma g?ncellenemedi" });
      }
      if (!result.affectedRows) {
        return res.status(404).json({ error: "KonuYma bulunamad?" });
      }
      broadcastInboxUpdate({
        type: "status",
        conversation_id: conversationId,
        status: "open",
        assigned_user_id: null,
      });
      return res.json({
        success: true,
        conversation_id: conversationId,
        status: "open",
        assigned_user_id: null,
      });
    });
  });
}

export function identifyConversation(req, res) {
  const conversationId = Number(req.params.conversation_id);
  if (!conversationId) {
    return res.status(400).json({ error: "conversation_id zorunlu" });
  }

  const { user_id, email, name } = req.body || {};

  ensureUser({ user_id, email, name }, (userErr, targetUserId) => {
    if (userErr) {
      return res.status(500).json({ error: "Kullanc bulunamad" });
    }

    const findSql = `
      SELECT conversation_id, user_id
      FROM support_conversations
      WHERE conversation_id = ?
      LIMIT 1
    `;

    db.query(findSql, [conversationId], (findErr, rows) => {
      if (findErr) {
        console.error("Support conversation lookup failed:", findErr);
        return res.status(500).json({ error: "KonuŸma okunamad" });
      }
      if (!rows.length) {
        return res.status(404).json({ error: "KonuŸma bulunamad" });
      }

      const currentUserId = rows[0].user_id;
      if (Number(currentUserId) === Number(targetUserId)) {
        broadcastInboxUpdate({ type: "identify", conversation_id: conversationId, user_id: targetUserId });
        return res.json({ conversation_id: conversationId, user_id: targetUserId });
      }

      const updateConversationSql = `
        UPDATE support_conversations
        SET user_id = ?
        WHERE conversation_id = ?
      `;

      db.query(updateConversationSql, [targetUserId, conversationId], (updErr) => {
        if (updErr) {
          console.error("Support conversation update failed:", updErr);
          return res.status(500).json({ error: "KonuŸma gncellenemedi" });
        }

        const updateMessagesSql = `
          UPDATE support_messages
          SET sender_id = ?
          WHERE conversation_id = ?
            AND sender_id = ?
        `;

        db.query(updateMessagesSql, [targetUserId, conversationId, currentUserId], (msgErr) => {
          if (msgErr) {
            console.error("Support messages update failed:", msgErr);
          }
          broadcastInboxUpdate({ type: "identify", conversation_id: conversationId, user_id: targetUserId });
          return res.json({ conversation_id: conversationId, user_id: targetUserId });
        });
      });
    });
  });
}

export function postSupportReply(req, res) {
  const conversationId = Number(req.params.conversation_id);
  const agentId = pickAgentId(req.body.agent_id);
  const { text } = req.body;
  const files = Array.isArray(req.files) ? req.files : [];
  const trimmedText = text && typeof text === "string" ? text.trim() : "";

  if (!conversationId) {
    return res.status(400).json({ error: "conversation_id zorunlu" });
  }
  if (!trimmedText && files.length === 0) {
    return res.status(400).json({ error: "Mesaj veya dosya ekleyin" });
  }

  const convoSql = `
    SELECT sc.conversation_id, sc.user_id, u.email
    FROM support_conversations sc
    LEFT JOIN users u ON u.user_id = sc.user_id
    WHERE sc.conversation_id = ?
  `;

  db.query(convoSql, [conversationId], (metaErr, rows) => {
    if (metaErr) {
      console.error("Support conversation lookup failed:", metaErr);
      return res.status(500).json({ error: "Konuşma okunamadı" });
    }
    if (rows.length === 0) {
      return res.status(404).json({ error: "Konuşma bulunamadı" });
    }

    const conversation = rows[0];
    const fallbackSender = conversation.user_id;
    const sender = Number.isFinite(agentId) ? agentId : fallbackSender;
    const customerEmail = conversation.email;

    const insertSql = `
      INSERT INTO support_messages (conversation_id, sender_id, message_text, created_at)
      VALUES (?, ?, ?, NOW())
    `;
    const messageText = trimmedText || "Dosya eklendi";

    const doInsert = (senderId, attemptFallback) => {
      db.query(insertSql, [conversationId, senderId, messageText], (err, result) => {
        if (err) {
          // If agent user_id is missing, retry with conversation owner id to satisfy FK.
          if (attemptFallback && senderId !== fallbackSender) {
            console.warn("Agent user missing, falling back to conversation user:", senderId, err?.code);
            return doInsert(fallbackSender, false);
          }
          console.error("Support reply insert failed:", err);
          return res.status(500).json({ error: "Mesaj kaydedilemedi" });
        }

        const finalize = (attachments = []) => {
          const messagePayload = {
            id: result.insertId,
            sender_id: senderId,
            from: "support",
            text: messageText,
            timestamp: new Date().toISOString(),
            attachments,
          };

          res.json({
            conversation_id: conversationId,
            message: messagePayload,
          });

          broadcastConversationMessage(conversationId, messagePayload);
          broadcastInboxUpdate({ type: "message", conversation_id: conversationId });

          // Arka planda müşteriye e-posta bildirimi gönder.
          if (customerEmail) {
            const attachmentLine = attachments.length
              ? `<p><strong>Attachments:</strong> ${attachments.map((a) => a.file_name).join(", ")}</p>`
              : "";
            sendMail({
              to: customerEmail,
              subject: "New reply from support",
              html: `
                <p>We replied to your support conversation #${conversationId}:</p>
                <p>${messageText}</p>
                ${attachmentLine}
                <p>If you have more details, just reply here in chat.</p>
              `,
            }).catch((err) => console.error("Customer email failed:", err));
          }
        };

        saveAttachments(files, result.insertId)
          .then((attachments) => finalize(attachments))
          .catch((attErr) => {
            console.error("Support reply attachment save failed:", attErr);
            finalize([]);
          });
      });
    };

    doInsert(sender, true);
  });
}
