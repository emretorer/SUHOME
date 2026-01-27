import db from "../db.js";

function runQuery(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

async function userCanReview(userId, productId) {
  if (!userId || !productId) return false;
  const rows = await runQuery(
    `SELECT 1
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.order_id
      WHERE o.user_id = ? AND oi.product_id = ? AND LOWER(o.status) = 'delivered'
      LIMIT 1`,
    [userId, productId]
  );
  return rows.length > 0;
}

async function refreshProductRating(productId) {
  const [row] = await runQuery(
    `SELECT 
       COALESCE(AVG(rating), 0) AS avg_rating,
       COUNT(*) AS rating_count
     FROM comments
     WHERE product_id = ? AND rating IS NOT NULL`,
    [productId]
  );

  const avg = Number(row?.avg_rating ?? 0);
  const count = Number(row?.rating_count ?? 0);
  // Update only existing column to avoid schema mismatches
  await runQuery(
    `UPDATE products
     SET product_rating = ?, rating_count = ?
     WHERE product_id = ?`,
    [avg, count, productId]
  );

  return { averageRating: avg, ratingCount: count };
}

export async function listComments(req, res) {
  const { productId } = req.params;
  const requesterId = req.user?.user_id ?? Number(req.query.userId);
  if (!productId) return res.status(400).json({ message: "productId is required" });

  try {
    const params = [productId];
    const includeOwn = Number.isFinite(requesterId) && requesterId > 0;

    const rows = await runQuery(
      `SELECT 
         c.comment_id,
         c.user_id,
         c.product_id,
         c.rating,
         c.comment_text,
         c.created_at,
         c.status,
         u.full_name AS user_name
       FROM comments c
       LEFT JOIN users u ON u.user_id = c.user_id
       WHERE c.product_id = ?
         AND (
           c.status IS NULL
           OR c.status = 'approved'
           ${includeOwn ? "OR c.user_id = ?" : ""}
         )
       ORDER BY c.created_at DESC`,
      includeOwn ? [...params, requesterId] : params
    );

    const normalized = rows.map((row) => ({
      comment_id: row.comment_id,
      user_id: row.user_id,
      product_id: row.product_id,
      rating: Number(row.rating) || 0,
      comment_text: row.comment_text || "",
      created_at: row.created_at,
      display_name: row.user_name || `User ${row.user_id}`,
      status: row.status || "approved",
    }));

    return res.json(normalized);
  } catch (err) {
    console.error("listComments error:", err);
    return res.status(500).json({ message: "Comments fetch failed" });
  }
}

export async function canReview(req, res) {
  const userId = req.user?.user_id ?? Number(req.query.userId);
  const { productId } = req.params;
  const allowed = await userCanReview(Number(userId), Number(productId));
  return res.json({ canReview: allowed });
}

export async function addComment(req, res) {
  const userId = req.user?.user_id ?? req.body.user_id;
  const { productId, rating, text } = req.body;

  const numericRating = Number(rating);
  const rawText = (text ?? "").toString();
  const status = "pending";

  if (!userId || !productId || !numericRating) {
    return res.status(400).json({ message: "Missing fields" });
  }

  try {
    const allowed = await userCanReview(Number(userId), Number(productId));
    if (!allowed) {
      return res.status(403).json({ message: "You can review after delivery." });
    }

    if (numericRating < 1 || numericRating > 5) {
      return res.status(400).json({ message: "Rating must be between 1 and 5" });
    }

    await runQuery(
      `INSERT INTO comments (user_id, product_id, rating, comment_text, status, created_at)
       VALUES (?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE 
         rating = VALUES(rating),
         comment_text = VALUES(comment_text),
         status = 'pending'`,
      [userId, productId, numericRating, rawText, status]
    );

    const agg = await refreshProductRating(productId);

    return res
      .status(201)
      .json({ success: true, status, averageRating: agg.averageRating, ratingCount: agg.ratingCount });
  } catch (err) {
    console.error("addComment error:", err);
    return res.status(500).json({ message: "Comment save failed" });
  }
}

export async function getUserComments(req, res) {
  const userId = req.user?.user_id ?? Number(req.query.userId);
  if (!userId) return res.status(400).json({ message: "userId is required" });

  try {
    const rows = await runQuery(
      `SELECT 
         comment_id,
         product_id,
         rating,
       comment_text,
       status,
       created_at
      FROM comments
      WHERE user_id = ?
      ORDER BY created_at DESC`,
      [userId]
    );
    const normalized = rows.map((row) => ({
      ...row,
      status: row.status || "approved",
    }));
    return res.json(normalized);
  } catch (err) {
    console.error("getUserComments error:", err);
    return res.status(500).json({ message: "User comments fetch failed" });
  }
}

export async function approveComment(req, res) {
  const { commentId } = req.params;
  if (!commentId) return res.status(400).json({ message: "commentId is required" });

  try {
    if (req.user && req.user.role !== "product_manager" && req.user.role !== "admin") {
      return res.status(403).json({ message: "Only product managers can approve" });
    }

    const result = await runQuery(
      `UPDATE comments
       SET status = 'approved'
       WHERE comment_id = ?`,
      [commentId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Comment not found" });
    }

    const [row] = await runQuery(`SELECT product_id FROM comments WHERE comment_id = ?`, [
      commentId,
    ]);
    if (row?.product_id) {
      await refreshProductRating(row.product_id);
    }

    return res.json({ success: true, status: "approved" });
  } catch (err) {
    console.error("approveComment error:", err);
    return res.status(500).json({ message: "Approve failed" });
  }
}

export async function rejectComment(req, res) {
  const { commentId } = req.params;
  if (!commentId) return res.status(400).json({ message: "commentId is required" });

  try {
    if (req.user && req.user.role !== "product_manager" && req.user.role !== "admin") {
      return res.status(403).json({ message: "Only product managers can reject" });
    }

    const result = await runQuery(
      `UPDATE comments
       SET status = 'rejected'
       WHERE comment_id = ?`,
      [commentId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Comment not found" });
    }

    const [row] = await runQuery(`SELECT product_id FROM comments WHERE comment_id = ?`, [
      commentId,
    ]);
    if (row?.product_id) {
      await refreshProductRating(row.product_id);
    }

    return res.json({ success: true, status: "rejected" });
  } catch (err) {
    console.error("rejectComment error:", err);
    return res.status(500).json({ message: "Reject failed" });
  }
}

export async function listPendingForManager(_req, res) {
  try {
    const rows = await runQuery(
      `SELECT 
         c.comment_id,
         c.user_id,
         u.full_name AS user_name,
         c.product_id,
         p.product_name,
         c.rating,
         c.comment_text,
         c.status,
         c.created_at
       FROM comments c
       LEFT JOIN users u ON u.user_id = c.user_id
       LEFT JOIN products p ON p.product_id = c.product_id
       WHERE c.status = 'pending'
       ORDER BY c.created_at DESC`
    );

    return res.json(
      rows.map((row) => ({
        comment_id: row.comment_id,
        user_id: row.user_id,
        user_name: row.user_name || `User ${row.user_id}`,
        product_id: row.product_id,
        product_name: row.product_name || `Product ${row.product_id}`,
        rating: Number(row.rating) || 0,
        comment_text: row.comment_text || "",
        status: row.status || "pending",
        created_at: row.created_at,
      }))
    );
  } catch (err) {
    console.error("listPendingForManager error:", err);
    return res.status(500).json({ message: "Pending comments fetch failed" });
  }
}
