import db from "../db.js";

function resolveUserId({ userId, email }, callback) {
  const numericId = Number(userId);
  if (Number.isFinite(numericId) && numericId > 0) {
    return callback(null, numericId);
  }
  const safeEmail = email && String(email).trim();
  if (!safeEmail) {
    return callback(new Error("missing_user_identifier"));
  }
  const sql = "SELECT user_id FROM users WHERE email = ? LIMIT 1";
  db.query(sql, [safeEmail], (err, rows) => {
    if (err) return callback(err);
    if (!rows.length) return callback(new Error("user_not_found"));
    return callback(null, rows[0].user_id);
  });
}

function ensureWishlist(userId, callback) {
  const findSql = "SELECT wishlist_id FROM wishlists WHERE user_id = ? LIMIT 1";
  db.query(findSql, [userId], (findErr, rows) => {
    if (findErr) {
      console.error("Wishlist lookup failed:", findErr);
      return callback(findErr);
    }
    if (rows.length > 0) {
      return callback(null, rows[0].wishlist_id);
    }

    const insertSql = "INSERT INTO wishlists (user_id, created_at) VALUES (?, NOW())";
    db.query(insertSql, [userId], (insErr, result) => {
      if (insErr) {
        console.error("Wishlist create failed:", insErr);
        return callback(insErr);
      }
      return callback(null, result.insertId);
    });
  });
}

export function getWishlist(req, res) {
  const { user_id: userId, email } = req.query;

  resolveUserId({ userId, email }, (userErr, resolvedUserId) => {
    if (userErr) {
      return res.status(400).json({ error: "user_id veya email zorunlu" });
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

    db.query(sql, [resolvedUserId], (err, rows) => {
      if (err) {
        console.error("Wishlist fetch failed:", err);
        return res.status(500).json({ error: "Wishlist alnamad" });
      }

      const seen = new Set();
      const unique = [];
      rows.forEach((row) => {
        const key = String(row.product_id);
        if (seen.has(key)) return;
        seen.add(key);
        unique.push({
          id: row.product_id,
          product_id: row.product_id,
          name: row.product_name || `Product #${row.product_id}`,
          image: row.product_image || null,
          price: Number(row.product_price) || 0,
          added_at: row.added_at,
        });
      });

      res.json(unique);
    });
  });
}

export function addWishlistItem(req, res) {
  const { user_id: userId, email } = req.body || {};
  const productId = Number(req.body?.product_id);

  if (!productId) {
    return res.status(400).json({ error: "product_id zorunlu" });
  }

  resolveUserId({ userId, email }, (userErr, resolvedUserId) => {
    if (userErr) {
      return res.status(400).json({ error: "user_id veya email zorunlu" });
    }

    ensureWishlist(resolvedUserId, (listErr, wishlistId) => {
      if (listErr) {
        return res.status(500).json({ error: "Wishlist oluŸturulamad" });
      }

      const existsSql = `
        SELECT wishlist_item_id
        FROM wishlist_items
        WHERE wishlist_id = ? AND product_id = ?
        LIMIT 1
      `;

      db.query(existsSql, [wishlistId, productId], (existsErr, rows) => {
        if (existsErr) {
          console.error("Wishlist item lookup failed:", existsErr);
          return res.status(500).json({ error: "Wishlist gncellenemedi" });
        }
        if (rows.length > 0) {
          return res.json({ success: true, item: { id: productId, product_id: productId } });
        }

        const insertSql = `
          INSERT INTO wishlist_items (wishlist_id, product_id, added_at)
          VALUES (?, ?, NOW())
        `;
        db.query(insertSql, [wishlistId, productId], (insErr) => {
          if (insErr) {
            console.error("Wishlist item insert failed:", insErr);
            return res.status(500).json({ error: "Wishlist gncellenemedi" });
          }
          return res.json({ success: true, item: { id: productId, product_id: productId } });
        });
      });
    });
  });
}

export function removeWishlistItem(req, res) {
  const { user_id: userId, email } = req.query;
  const productId = Number(req.params.product_id);

  if (!productId) {
    return res.status(400).json({ error: "product_id zorunlu" });
  }

  resolveUserId({ userId, email }, (userErr, resolvedUserId) => {
    if (userErr) {
      return res.status(400).json({ error: "user_id veya email zorunlu" });
    }

    const deleteSql = `
      DELETE wi
      FROM wishlist_items wi
      JOIN wishlists w ON w.wishlist_id = wi.wishlist_id
      WHERE w.user_id = ? AND wi.product_id = ?
    `;
    db.query(deleteSql, [resolvedUserId, productId], (delErr) => {
      if (delErr) {
        console.error("Wishlist item delete failed:", delErr);
        return res.status(500).json({ error: "Wishlist gncellenemedi" });
      }
      return res.json({ success: true });
    });
  });
}
