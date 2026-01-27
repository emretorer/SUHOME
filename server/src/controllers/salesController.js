import db from "../db.js";
import { sendMail } from "../utils/mailer.js";

function pickValue(req, key) {
  return req.body?.[key] ?? req.query?.[key];
}

function parseProductIds(raw) {
  if (Array.isArray(raw)) return raw.map((id) => Number(id)).filter(Number.isFinite);
  if (typeof raw === "string") {
    return raw
      .split(",")
      .map((val) => Number(val.trim()))
      .filter(Number.isFinite);
  }
  const asNumber = Number(raw);
  return Number.isFinite(asNumber) ? [asNumber] : [];
}

function normalizeDateTime(value) {
  if (!value) return null;
  const asDate = new Date(value);
  if (!Number.isNaN(asDate.getTime())) return asDate;
  return null;
}

function resolveDateRange(req) {
  const fromRaw = pickValue(req, "from") ?? pickValue(req, "start") ?? pickValue(req, "start_at");
  const toRaw = pickValue(req, "to") ?? pickValue(req, "end") ?? pickValue(req, "end_at");
  const now = new Date();
  let from = normalizeDateTime(fromRaw) ?? new Date("1970-01-01T00:00:00Z");
  let to = normalizeDateTime(toRaw) ?? now;
  if (from > to) {
    const tmp = from;
    from = to;
    to = tmp;
  }
  return { from, to };
}

function formatEmailDate(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().replace("T", " ").slice(0, 16);
}

async function notifyWishlistUsers(productIds, discountMeta) {
  if (!productIds.length) return 0;

  const sql = `
    SELECT u.email, u.full_name, p.product_name
    FROM wishlist_items wi
    JOIN wishlists w ON w.wishlist_id = wi.wishlist_id
    JOIN users u ON u.user_id = w.user_id
    JOIN products p ON p.product_id = wi.product_id
    WHERE wi.product_id IN (?)
  `;

  const rows = await new Promise((resolve) => {
    db.query(sql, [productIds], (err, results) => {
      if (err) {
        console.error("Wishlist lookup failed:", err);
        return resolve([]);
      }
      resolve(results || []);
    });
  });

  if (!rows.length) return 0;

  const grouped = new Map();
  rows.forEach((row) => {
    if (!row.email) return;
    const existing = grouped.get(row.email) || { name: row.full_name, items: [] };
    existing.items.push(row.product_name || "Product");
    grouped.set(row.email, existing);
  });

  const rate = Number(discountMeta?.rate) || 0;
  const startAt = formatEmailDate(discountMeta?.startAt);
  const endAt = formatEmailDate(discountMeta?.endAt);
  const dateLine = startAt && endAt ? `Valid: ${startAt} to ${endAt}` : "";

  const entries = Array.from(grouped.entries());
  await Promise.all(
    entries.map(([email, payload]) => {
      const subject = "Wishlist discount available";
      const lines = payload.items.map((item) => `- ${item}`).join("\n");
      const intro = `A discount of ${rate}% is now available for these wishlist items:`;
      const text =
        `Hello ${payload.name || "Customer"},\n\n` +
        `${intro}\n${lines}\n\n` +
        `${dateLine ? `${dateLine}\n\n` : ""}` +
        "Visit SUHOME to see the updated prices.";
      const html = `
        <p>Hello ${payload.name || "Customer"},</p>
        <p>${intro}</p>
        <ul>${payload.items.map((item) => `<li>${item}</li>`).join("")}</ul>
        ${dateLine ? `<p><strong>${dateLine}</strong></p>` : ""}
        <p>Visit SUHOME to see the updated prices.</p>
      `;
      return sendMail({ to: email, subject, text, html }).catch((err) => {
        console.error("Wishlist email failed:", err);
        return null;
      });
    })
  );

  return entries.length;
}

export function createDiscount(req, res) {
  const rate = Number(pickValue(req, "rate"));
  const startRaw = pickValue(req, "start_at");
  const endRaw = pickValue(req, "end_at");
  const productIds = parseProductIds(pickValue(req, "product_ids") ?? pickValue(req, "productIds"));
  const code = String(pickValue(req, "code") || `DISC-${Date.now()}`);

  if (!Number.isFinite(rate) || rate <= 0 || rate >= 100) {
    return res.status(400).json({ error: "rate must be between 0 and 100" });
  }
  if (!productIds.length) {
    return res.status(400).json({ error: "product_ids required" });
  }

  const startAt = normalizeDateTime(startRaw);
  const endAt = normalizeDateTime(endRaw);
  if (!startAt || !endAt) {
    return res.status(400).json({ error: "start_at and end_at are required" });
  }

  const insertDiscountSql = `
    INSERT INTO discounts (code, type, value, start_at, end_at, status)
    VALUES (?, 'rate', ?, ?, ?, 'active')
  `;

  db.query(insertDiscountSql, [code, rate, startAt, endAt], (err, result) => {
    if (err) {
      console.error("Discount insert failed:", err);
      return res.status(500).json({ error: "Discount create failed" });
    }

    const discountId = result.insertId;
    const values = productIds.map((id) => [discountId, id]);
    const deactivateSql = `
      UPDATE discount_products
      SET is_active = 0
      WHERE product_id IN (?)
    `;

    db.query(deactivateSql, [productIds], (deactivateErr) => {
      if (deactivateErr) {
        console.error("Discount deactivate failed:", deactivateErr);
        return res.status(500).json({ error: "Discount deactivate failed" });
      }

      const values = productIds.map((id) => [discountId, id, 1]);
      const linkSql = `
        INSERT INTO discount_products (discount_id, product_id, is_active)
        VALUES ?
      `;

      db.query(linkSql, [values], async (linkErr) => {
        if (linkErr) {
          console.error("Discount link failed:", linkErr);
          return res.status(500).json({ error: "Discount link failed" });
        }

        const notified = await notifyWishlistUsers(productIds, {
          rate,
          startAt,
          endAt,
        });
        return res.json({ success: true, discount_id: discountId, notified });
      });
    });
  });
}

export function updateProductPrice(req, res) {
  const { id } = req.params;
  const price = Number(pickValue(req, "price"));

  if (!Number.isFinite(price) || price < 0) {
    return res.status(400).json({ error: "price missing or invalid" });
  }

  const sql = `
    UPDATE products
    SET product_price = ?
    WHERE product_id = ?
  `;

  db.query(sql, [price, id], (err, result) => {
    if (err) {
      console.error("Price update failed:", err);
      return res.status(500).json({ error: "Price update failed" });
    }
    if (!result.affectedRows) {
      return res.status(404).json({ error: "Product not found" });
    }
    const effectiveFrom = new Date();
    const costValue = Number((price * 0.5).toFixed(2));

    const updateCostSql = `
      UPDATE product_costs
      SET cost = ?, effective_from = ?, effective_to = NULL
      WHERE product_id = ?
    `;

    db.query(updateCostSql, [costValue, effectiveFrom, id], (updateErr, updateResult) => {
      if (updateErr) {
        console.error("Cost update failed:", updateErr);
        return res.json({ success: true, product_id: Number(id), price, cost: costValue });
      }

      if (updateResult.affectedRows === 0) {
        const insertSql = `
          INSERT INTO product_costs (product_id, cost, effective_from, effective_to)
          VALUES (?, ?, ?, NULL)
        `;

        db.query(insertSql, [id, costValue, effectiveFrom], (insertErr) => {
          if (insertErr) {
            console.error("Cost insert failed:", insertErr);
          }
          return res.json({
            success: true,
            product_id: Number(id),
            price,
            cost: costValue,
          });
        });
        return;
      }

      return res.json({
        success: true,
        product_id: Number(id),
        price,
        cost: costValue,
      });
    });
  });
}

export function updateProductCost(req, res) {
  const { id } = req.params;
  const cost = Number(pickValue(req, "cost"));
  const effectiveFrom = normalizeDateTime(pickValue(req, "effective_from")) ?? new Date();

  if (!Number.isFinite(cost) || cost < 0) {
    return res.status(400).json({ error: "cost missing or invalid" });
  }

  const closeSql = `
    UPDATE product_costs
    SET effective_to = ?
    WHERE product_id = ? AND (effective_to IS NULL OR effective_to > ?)
  `;

  db.query(closeSql, [effectiveFrom, id, effectiveFrom], (closeErr) => {
    if (closeErr) {
      console.error("Cost close failed:", closeErr);
      return res.status(500).json({ error: "Cost update failed" });
    }

    const insertSql = `
      INSERT INTO product_costs (product_id, cost, effective_from, effective_to)
      VALUES (?, ?, ?, NULL)
    `;

    db.query(insertSql, [id, cost, effectiveFrom], (insertErr) => {
      if (insertErr) {
        console.error("Cost insert failed:", insertErr);
        return res.status(500).json({ error: "Cost update failed" });
      }
      return res.json({ success: true, product_id: Number(id), cost });
    });
  });
}

export function getProductCost(req, res) {
  const { id } = req.params;
  const productId = Number(id);
  if (!Number.isFinite(productId)) {
    return res.status(400).json({ error: "product id is required" });
  }

  const sql = `
    SELECT cost, effective_from
    FROM product_costs
    WHERE product_id = ?
    ORDER BY effective_from DESC
    LIMIT 1
  `;

  db.query(sql, [productId], (err, rows = []) => {
    if (err) {
      console.error("Product cost fetch failed:", err);
      return res.status(500).json({ error: "Cost could not be loaded" });
    }
    if (!rows.length) {
      return res.json({ product_id: productId, cost: null, effective_from: null });
    }
    return res.json({
      product_id: productId,
      cost: Number(rows[0].cost || 0),
      effective_from: rows[0].effective_from,
    });
  });
}

export function getInvoicesByDate(req, res) {
  const { from, to } = resolveDateRange(req);

  const sql = `
    SELECT
      i.invoice_id,
      i.order_id,
      i.issued_at,
      i.amount,
      i.status,
      o.user_id,
      u.full_name AS customer_name,
      u.email AS customer_email
    FROM invoices i
    LEFT JOIN orders o ON o.order_id = i.order_id
    LEFT JOIN users u ON u.user_id = o.user_id
    WHERE i.issued_at BETWEEN ? AND ?
    ORDER BY i.issued_at DESC
  `;

  db.query(sql, [from, to], (err, rows) => {
    if (err) {
      console.error("Invoice list failed:", err);
      return res.status(500).json({ error: "Invoices could not be loaded" });
    }
    return res.json(rows || []);
  });
}

export function getProfitReport(req, res) {
  const { from, to } = resolveDateRange(req);

  const sql = `
    SELECT
      DATE(o.order_date) AS date_label,
      SUM(oi.quantity * oi.unit_price) AS revenue,
      SUM(oi.quantity * COALESCE(pc.cost, oi.unit_price * 0.5)) AS cost
    FROM orders o
    JOIN order_items oi ON oi.order_id = o.order_id
    LEFT JOIN product_costs pc
      ON pc.product_id = oi.product_id
      AND o.order_date >= pc.effective_from
      AND (pc.effective_to IS NULL OR o.order_date < pc.effective_to)
    WHERE o.order_date BETWEEN ? AND ?
    GROUP BY DATE(o.order_date)
    ORDER BY DATE(o.order_date)
  `;

  db.query(sql, [from, to], (err, rows = []) => {
    if (err) {
      console.error("Profit report failed:", err);
      return res.status(500).json({ error: "Report could not be loaded" });
    }

    const series = rows.map((row) => {
      const revenue = Number(row.revenue) || 0;
      const cost = Number(row.cost) || 0;
      return {
        date: row.date_label,
        revenue,
        cost,
        profit: revenue - cost,
      };
    });

    const totals = series.reduce(
      (acc, item) => ({
        revenue: acc.revenue + item.revenue,
        cost: acc.cost + item.cost,
        profit: acc.profit + item.profit,
      }),
      { revenue: 0, cost: 0, profit: 0 }
    );

    return res.json({ from, to, totals, series });
  });
}

export function getReturnRequests(req, res) {
  const sql = `
    SELECT
      rr.return_id,
      rr.order_item_id,
      rr.user_id,
      rr.reason,
      rr.status AS return_status,
      rr.requested_at,
      rr.processed_at,
      oi.order_id,
      oi.product_id,
      oi.quantity,
      oi.unit_price,
      o.order_date,
      o.status AS order_status,
      d.delivery_status,
      u.full_name AS customer_name,
      u.email AS customer_email,
      COALESCE(p.product_name, CONCAT('Product #', oi.product_id)) AS product_name,
      p.product_image
    FROM return_requests rr
    JOIN order_items oi ON oi.order_item_id = rr.order_item_id
    JOIN orders o ON o.order_id = oi.order_id
    LEFT JOIN deliveries d ON d.order_item_id = rr.order_item_id
    LEFT JOIN users u ON u.user_id = rr.user_id
    LEFT JOIN products p ON p.product_id = oi.product_id
    ORDER BY rr.requested_at DESC
  `;

  db.query(sql, (err, rows = []) => {
    if (err) {
      console.error("Return request list failed:", err);
      return res.status(500).json({ error: "Return requests could not be loaded" });
    }

    const now = Date.now();
    const payload = rows.map((row) => {
      const status = String(row.delivery_status || row.order_status || "")
        .toLowerCase()
        .replace(/-/g, "_")
        .replace(/\s+/g, "_");
      const delivered =
        status === "delivered" ||
        status === "refund_waiting" ||
        status === "refund_rejected" ||
        status === "refunded";
      const orderDate = row.order_date ? new Date(row.order_date) : null;
      const ageDays = orderDate ? (now - orderDate.getTime()) / (1000 * 60 * 60 * 24) : null;
      const returnEligible = Boolean(delivered && ageDays !== null && ageDays <= 30);

      return {
        return_id: row.return_id,
        order_item_id: row.order_item_id,
        order_id: row.order_id,
        user_id: row.user_id,
        customer_name: row.customer_name || `User #${row.user_id}`,
        customer_email: row.customer_email || null,
        product_id: row.product_id,
        product_name: row.product_name,
        product_image: row.product_image,
        quantity: Number(row.quantity || 0),
        unit_price: Number(row.unit_price || 0),
        reason: row.reason,
        return_status: row.return_status,
        order_date: row.order_date,
        order_status: row.order_status,
        delivery_status: row.delivery_status,
        return_eligible: returnEligible,
        requested_at: row.requested_at,
        processed_at: row.processed_at,
      };
    });

    return res.json(payload);
  });
}

export function updateReturnRequestStatus(req, res) {
  const returnId = Number(req.params.return_id);
  const nextStatus = String(req.body?.status || "").toLowerCase();

  if (!Number.isFinite(returnId)) {
    return res.status(400).json({ error: "return_id is required" });
  }
  if (!nextStatus) {
    return res.status(400).json({ error: "status is required" });
  }

  const allowedStatuses = ["accepted", "rejected", "received", "refunded"];
  if (!allowedStatuses.includes(nextStatus)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  const lookupSql = `
    SELECT
      rr.return_id,
      rr.status AS return_status,
      rr.order_item_id,
      oi.order_id,
      oi.product_id,
      oi.quantity,
      oi.unit_price,
      o.status AS order_status,
      u.email AS customer_email,
      u.full_name AS customer_name,
      p.product_name
    FROM return_requests rr
    JOIN order_items oi ON oi.order_item_id = rr.order_item_id
    JOIN orders o ON o.order_id = oi.order_id
    JOIN users u ON u.user_id = o.user_id
    JOIN products p ON p.product_id = oi.product_id
    WHERE rr.return_id = ?
    LIMIT 1
  `;

  db.query(lookupSql, [returnId], (err, rows) => {
    if (err) {
      console.error("Return request lookup failed:", err);
      return res.status(500).json({ error: "Return request lookup failed" });
    }
    if (!rows.length) {
      return res.status(404).json({ error: "Return request not found" });
    }

    const row = rows[0];
    const current = String(row.return_status || "").toLowerCase();
    const orderStatus = String(row.order_status || "")
      .toLowerCase()
      .replace(/-/g, "_")
      .replace(/\s+/g, "_");
    const isOrderRefundWaiting =
      orderStatus === "refund_waiting" || orderStatus === "refundwaiting";
    const isPendingReturn = ["requested", "accepted", "received"].includes(current);

    const allowedTransition =
      (nextStatus === "accepted" && current === "requested") ||
      (nextStatus === "rejected" && (isPendingReturn || isOrderRefundWaiting)) ||
      (nextStatus === "received" && current === "accepted") ||
      (nextStatus === "refunded" && (isPendingReturn || isOrderRefundWaiting));

    if (!allowedTransition) {
      return res.status(400).json({ error: "Invalid status transition" });
    }

    const respond = () => res.json({ success: true, return_id: returnId, status: nextStatus });

    const updateReturn = (done) => {
      db.query(
        "UPDATE return_requests SET status = ?, processed_at = NOW() WHERE return_id = ?",
        [nextStatus, returnId],
        (updateErr) => {
          if (updateErr) {
            console.error("Return request update failed:", updateErr);
            return res.status(500).json({ error: "Return request update failed" });
          }
          if (typeof done === "function") {
            return done();
          }
          return respond();
        }
      );
    };

    const updateDeliveryStatus = (deliveryStatus, callback) => {
      if (!deliveryStatus) return callback();
      db.query(
        "UPDATE deliveries SET delivery_status = ? WHERE order_item_id = ?",
        [deliveryStatus, row.order_item_id],
        () => callback()
      );
    };

    const syncOrderStatus = (orderStatus, deliveryStatus, done) => {
      const finish = typeof done === "function" ? done : () => {};
      if (!orderStatus && !deliveryStatus) return finish();

      const updateOrder = (next, callback) => {
        if (!next) return callback();
        const guard =
          next === "refund_waiting" || next === "refund_rejected"
            ? " AND status <> 'refunded'"
            : "";
        db.query(
          `UPDATE orders SET status = ? WHERE order_id = ?${guard}`,
          [next, row.order_id],
          (orderErr) => {
            if (orderErr) {
              console.error("Order status sync failed:", orderErr);
            }
            return callback();
          }
        );
      };

      const updateDeliveries = (next, callback) => {
        if (!next) return callback();
        db.query(
          "UPDATE deliveries SET delivery_status = ? WHERE order_id = ?",
          [next, row.order_id],
          (deliveryErr) => {
            if (deliveryErr) {
              console.error("Delivery status sync failed:", deliveryErr);
            }
            return callback();
          }
        );
      };

      return updateOrder(orderStatus, () => updateDeliveries(deliveryStatus, finish));
    };

    if (nextStatus === "accepted") {
      return updateDeliveryStatus("refund_waiting", () =>
        updateReturn(() => syncOrderStatus("refund_waiting", "refund_waiting", respond))
      );
    }

    if (nextStatus === "rejected") {
      return updateDeliveryStatus("refund_rejected", () =>
        updateReturn(() => syncOrderStatus("refund_rejected", "refund_rejected", respond))
      );
    }

    if (nextStatus === "received") {
      return updateDeliveryStatus("returned", () => updateReturn(respond));
    }

    if (nextStatus === "refunded") {
      const restockSql = `
        UPDATE products
        SET product_stock = product_stock + ?
        WHERE product_id = ?
      `;

      db.query(restockSql, [row.quantity, row.product_id], (restockErr) => {
        if (restockErr) {
          console.error("Restock failed:", restockErr);
          return res.status(500).json({ error: "Restock failed" });
        }

        const paymentSql = `
          SELECT payment_id
          FROM payments
          WHERE order_id = ?
          ORDER BY paid_at DESC, payment_id DESC
          LIMIT 1
        `;

        db.query(paymentSql, [row.order_id], (paymentErr, paymentRows = []) => {
          if (paymentErr) {
            console.error("Payment lookup failed:", paymentErr);
            return res.status(500).json({ error: "Payment lookup failed" });
          }
          if (!paymentRows.length) {
            return res.status(400).json({ error: "Payment not found for order" });
          }

          const amount = Number(row.unit_price || 0) * Number(row.quantity || 0);
          const refundSql = `
            INSERT INTO refunds (payment_id, return_id, amount, status, processed_at)
            VALUES (?, ?, ?, 'completed', NOW())
          `;

          db.query(refundSql, [paymentRows[0].payment_id, returnId, amount], (refundErr) => {
            if (refundErr) {
              console.error("Refund insert failed:", refundErr);
              return res.status(500).json({ error: "Refund insert failed" });
            }

            updateDeliveryStatus("refunded", () =>
              updateReturn(() =>
                syncOrderStatus("refunded", "refunded", () => {
                  if (row.customer_email) {
                    const subject = "Your refund has been processed";
                    const productLine = row.product_name ? `Product: ${row.product_name}\n` : "";
                    const text =
                      `Hello ${row.customer_name || "Customer"},\n\n` +
                      "Your refund has been processed.\n\n" +
                      `${productLine}` +
                      `Quantity: ${row.quantity}\n` +
                      `Amount: ${amount.toLocaleString("tr-TR")} TL\n\n` +
                      "If you have any questions, please contact support.";
                    const html = `
                      <p>Hello ${row.customer_name || "Customer"},</p>
                      <p>Your refund has been processed.</p>
                      ${row.product_name ? `<p><strong>Product:</strong> ${row.product_name}</p>` : ""}
                      <p><strong>Quantity:</strong> ${row.quantity}</p>
                      <p><strong>Amount:</strong> ${amount.toLocaleString("tr-TR")} TL</p>
                      <p>If you have any questions, please contact support.</p>
                    `;
                    sendMail({ to: row.customer_email, subject, text, html }).catch((mailErr) => {
                      console.error("Refund email failed:", mailErr);
                    });
                  }
                  return respond();
                })
              )
            );
          });
        });
      });
      return;
    }

    return updateReturn();
  });
}
