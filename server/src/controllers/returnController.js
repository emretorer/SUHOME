import db from "../db.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseId(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

export function createReturnRequest(req, res) {
  const userId = parseId(req.body?.user_id);
  const orderItemId = parseId(req.body?.order_item_id);
  const reason = req.body?.reason ? String(req.body.reason).trim() : null;

  if (!userId || !orderItemId) {
    return res.status(400).json({ error: "user_id and order_item_id are required" });
  }

  const lookupSql = `
    SELECT
      oi.order_item_id,
      oi.order_id,
      oi.product_id,
      oi.quantity,
      oi.unit_price,
      o.user_id,
      o.order_date,
      o.status AS order_status,
      d.delivery_status
    FROM order_items oi
    JOIN orders o ON o.order_id = oi.order_id
    LEFT JOIN deliveries d ON d.order_id = oi.order_id
    WHERE oi.order_item_id = ? AND o.user_id = ?
    LIMIT 1
  `;

  db.query(lookupSql, [orderItemId, userId], (err, rows) => {
    if (err) {
      console.error("Return request lookup failed:", err);
      return res.status(500).json({ error: "Return request lookup failed" });
    }
    if (!rows.length) {
      return res.status(404).json({ error: "Order item not found" });
    }

    const row = rows[0];
    const orderStatus = String(row.order_status || "").toLowerCase();
    const deliveryStatus = String(row.delivery_status || "").toLowerCase();
    const isDelivered = orderStatus === "delivered" || deliveryStatus === "delivered";
    if (!isDelivered) {
      return res.status(400).json({ error: "Only delivered products can be returned" });
    }

    const orderDate = row.order_date ? new Date(row.order_date) : null;
    if (orderDate && !Number.isNaN(orderDate.getTime())) {
      const diffDays = (Date.now() - orderDate.getTime()) / MS_PER_DAY;
      if (diffDays > 30) {
        return res.status(400).json({ error: "Return window expired (30 days after delivery)" });
      }
    }

    const existingSql = `
      SELECT status
      FROM return_requests
      WHERE order_item_id = ?
      ORDER BY requested_at DESC
      LIMIT 1
    `;

    db.query(existingSql, [orderItemId], (existingErr, existingRows) => {
      if (existingErr) {
        console.error("Return request check failed:", existingErr);
        return res.status(500).json({ error: "Return request check failed" });
      }

      if (existingRows.length) {
        const existingStatus = String(existingRows[0].status || "");
        if (existingStatus && existingStatus !== "rejected") {
          return res.status(400).json({ error: "Return already requested" });
        }
      }

      const insertSql = `
        INSERT INTO return_requests (order_item_id, user_id, reason, status)
        VALUES (?, ?, ?, 'requested')
      `;

      db.query(insertSql, [orderItemId, userId, reason], (insertErr, result) => {
        if (insertErr) {
          console.error("Return request insert failed:", insertErr);
          return res.status(500).json({ error: "Return request could not be created" });
        }
        const response = {
          success: true,
          return_id: result.insertId,
          order_item_id: orderItemId,
          status: "requested",
        };

        const orderId = row.order_id;
        const updateOrderSql = `
          UPDATE orders
          SET status = 'refund_waiting'
          WHERE order_id = ? AND status <> 'refunded'
        `;
        db.query(updateOrderSql, [orderId], (orderErr) => {
          if (orderErr) {
            console.error("Order status update failed:", orderErr);
          }
          db.query(
            "UPDATE deliveries SET delivery_status = 'refund_waiting' WHERE order_id = ?",
            [orderId],
            (deliveryErr) => {
              if (deliveryErr) {
                console.error("Delivery status update failed:", deliveryErr);
              }
              return res.json(response);
            }
          );
        });
      });
    });
  });
}

export function getUserReturnRequests(req, res) {
  const userId = parseId(req.query?.user_id);
  if (!userId) {
    return res.status(400).json({ error: "user_id is required" });
  }

  const sql = `
    SELECT
      rr.return_id,
      rr.order_item_id,
      rr.user_id,
      rr.reason,
      rr.status,
      rr.requested_at,
      rr.processed_at,
      oi.order_id,
      oi.product_id,
      oi.quantity,
      oi.unit_price,
      COALESCE(p.product_name, CONCAT('Product #', oi.product_id)) AS product_name,
      p.product_image
    FROM return_requests rr
    JOIN order_items oi ON oi.order_item_id = rr.order_item_id
    LEFT JOIN products p ON p.product_id = oi.product_id
    WHERE rr.user_id = ?
    ORDER BY rr.requested_at DESC
  `;

  db.query(sql, [userId], (err, rows = []) => {
    if (err) {
      console.error("Return requests fetch failed:", err);
      return res.status(500).json({ error: "Return requests could not be loaded" });
    }
    return res.json(
      rows.map((row) => ({
        return_id: row.return_id,
        order_item_id: row.order_item_id,
        order_id: row.order_id,
        product_id: row.product_id,
        product_name: row.product_name,
        product_image: row.product_image,
        quantity: Number(row.quantity || 0),
        unit_price: Number(row.unit_price || 0),
        reason: row.reason,
        status: row.status,
        requested_at: row.requested_at,
        processed_at: row.processed_at,
      }))
    );
  });
}
