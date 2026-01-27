import db from "../db.js";
import { sendInvoiceEmailForOrder } from "./invoiceController.js";
import { sendMail } from "../utils/mailer.js";

function sendOrderStatusEmail({ orderId, status }) {
  const orderSql = `
    SELECT o.order_id, o.total_amount, u.email, u.full_name
    FROM orders o
    LEFT JOIN users u ON u.user_id = o.user_id
    WHERE o.order_id = ?
    LIMIT 1
  `;

  const itemsSql = `
    SELECT SUM(oi.quantity * oi.unit_price) AS total
    FROM order_items oi
    WHERE oi.order_id = ?
  `;

  db.query(orderSql, [orderId], (orderErr, orderRows) => {
    if (orderErr || !orderRows?.length) {
      console.error("Order email lookup failed:", orderErr);
      return;
    }

    const order = orderRows[0];
    if (!order.email) {
      console.warn("Order email missing; skipping status email.");
      return;
    }

    db.query(itemsSql, [orderId], (itemsErr, itemsRows) => {
      if (itemsErr) {
        console.error("Order items sum failed:", itemsErr);
      }

      const itemTotal = Number(itemsRows?.[0]?.total);
      const total = Number.isFinite(itemTotal) && itemTotal > 0
        ? itemTotal
        : Number(order.total_amount) || 0;
      const formattedTotal = total.toFixed(2);
      const normalizedStatus = status === "refunded" ? "Refunded" : "Cancelled";
      const subject = `SUHOME order ${normalizedStatus.toLowerCase()} - #${order.order_id}`;
      const text = [
        `Hello ${order.full_name || "Customer"},`,
        "",
        `Your order #${order.order_id} has been ${normalizedStatus.toLowerCase()}.`,
        `Refund amount: ${formattedTotal} TL`,
        "",
        "Thank you for shopping with SUHOME."
      ].join("\n");

      sendMail({ to: order.email, subject, text }).catch((err) => {
        console.error("Order status email failed:", err);
      });
    });
  });
}

/**
 * POST /orders/checkout
 * Body: { user_id, shipping_address, billing_address }
 *
 * Basit versiyon: cart_items tablosundaki TÃœM kayÄ±tlarÄ± tek bir sipariÅŸ sayÄ±yoruz.
 */
export function checkout(req, res) {
  let { user_id, shipping_address, billing_address, items, shipping_fee } = req.body;
  const shippingAddressPayload = normalizeAddressPayload(shipping_address);
  const billingAddressPayload = normalizeAddressPayload(billing_address);

  // ğŸ”¹ user_id gÃ¼venli hale getir (email vs gelirse 1'e dÃ¼ÅŸ)
  const safeUserId = Number(user_id);
  if (!safeUserId || Number.isNaN(safeUserId)) {
    user_id = 1; // ÅŸimdilik her sipariÅŸ tek kullanÄ±cÄ± Ã¼zerinden
  } else {
    user_id = safeUserId;
  }

  if (!user_id) {
    return res.status(400).json({ error: "user_id zorunludur" });
  }

  // EÄŸer body'den items geliyorsa (SPA'den) onu kullan; yoksa cart_items tablosundan oku.
  const providedItems = Array.isArray(items)
    ? items
        .map((it) => ({
          product_id: it.product_id ?? it.id,
          quantity: Number(it.quantity ?? it.qty ?? 1),
          unit_price: Number(it.price ?? it.unit_price ?? it.product_price),
        }))
        .filter(
          (it) =>
            it.product_id &&
            Number.isFinite(it.quantity) &&
            it.quantity > 0 &&
            Number.isFinite(it.unit_price)
        )
    : [];

  const handleCheckout = (cartItems) => {
    if (!cartItems.length) {
      return res.status(400).json({ error: "Sepet boÅŸ" });
    }

    // 2) Toplam tutarÄ± hesapla
    let totalAmount = 0;
    cartItems.forEach((it) => {
      totalAmount += Number(it.unit_price) * Number(it.quantity);
    });
    const shippingFee = Number(shipping_fee);
    if (Number.isFinite(shippingFee) && shippingFee > 0) {
      totalAmount += shippingFee;
    }

    // 3) orders tablosuna kaydet (status = 'placed')
    const sqlOrder = `
      INSERT INTO orders (user_id, order_date, status, total_amount, shipping_address, billing_address)
      VALUES (?, NOW(), 'processing', ?, ?, ?)
    `;

    db.query(
      sqlOrder,
      [user_id, totalAmount, shippingAddressPayload, billingAddressPayload],
      (err, orderResult) => {
        if (err) {
          console.error("Order oluÅŸturulamadÄ±:", err);
          return res.status(500).json({ error: "Order oluÅŸturulamadÄ±" });
        }

        const order_id = orderResult.insertId;

        // 4) order_items satÄ±rlarÄ±nÄ± hazÄ±rla
        const orderItemValues = cartItems.map((it) => [
          order_id,
          it.product_id,
          it.quantity,
          Number(it.unit_price),
        ]);

        const sqlOrderItems = `
          INSERT INTO order_items (order_id, product_id, quantity, unit_price)
          VALUES ?
        `;

        db.query(sqlOrderItems, [orderItemValues], (err) => {
          if (err) {
            console.error("Order items eklenemedi:", err);
            return res
              .status(500)
              .json({ error: "Order item ekleme sÄ±rasÄ±nda hata" });
          }

          const sqlInvoice = `
            INSERT INTO invoices (order_id, amount, status)
            VALUES (?, ?, 'issued')
          `;

          db.query(sqlInvoice, [order_id, totalAmount], (invoiceErr) => {
            if (invoiceErr) {
              console.error("Invoice insert failed:", invoiceErr);
            }
          });
          // 5) Stok azalt
          const sqlStock =
            "UPDATE products SET product_stock = product_stock - ? WHERE product_id = ?";

          let pending = cartItems.length;

          cartItems.forEach((it) => {
            db.query(sqlStock, [it.quantity, it.product_id], (err) => {
              if (err) {
                console.error("Stok gÃ¼ncellenirken hata:", err);
                // hata olsa bile diÄŸerlerini deniyoruz
              }

              if (--pending === 0) {
                // 6) deliveries tablosuna kayÄ±t (delivery_status = 'preparing')
                const sqlDelivery = `
                  INSERT INTO deliveries (order_id, customer_id, delivery_status)
                  VALUES (?, ?, 'preparing')
                `;

                db.query(sqlDelivery, [order_id, user_id], (err) => {
                  if (err) {
                    console.error("Delivery kaydÄ± oluÅŸturulamadÄ±:", err);
                    // devam ediyoruz, kritik deÄŸil
                  }

                  // 7) Sepeti temizle
                  db.query("DELETE FROM cart_items", (err) => {
                    if (err) {
                      console.error("Sepet temizlenemedi:", err);
                    }

                    // Invoice email (fire-and-forget)
                    sendInvoiceEmailForOrder(order_id).catch((e) =>
                      console.error("Invoice email error:", e)
                    );

                    return res.json({
                      success: true,
                      order_id,
                      total_amount: totalAmount,
                      order_status: "processing",
                      delivery_status: "preparing",
                    });
                  });
                });
              }
            });
          });
        });
      }
    );
  };

  // Body'de items varsa direkt kullan.
  if (providedItems.length > 0) {
    return handleCheckout(providedItems);
  }

  // 1) Cart item'larÄ± Ã¼rÃ¼n fiyatÄ±yla beraber al (fallback)
  const sqlCart = `
    SELECT 
      ci.cart_item_id AS id,
      ci.product_id,
      ci.quantity,
      p.product_price AS unit_price
    FROM cart_items ci
    JOIN products p ON ci.product_id = p.product_id
  `;

  db.query(sqlCart, (err, cartItems) => {
    if (err) {
      console.error("Cart okunamadÄ±:", err);
      return res.status(500).json({ error: "Sepet okunamadÄ±" });
    }

    handleCheckout(cartItems);
  });
}
 
function normalizeAddressPayload(value) {
  if (!value) return null;

  // If already an object, keep full detail and store as JSON string.
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return null;
    }
  }

  // If string, try JSON parse; if parseable, re-stringify to normalize.
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object") {
        return JSON.stringify(parsed);
      }
    } catch {
      // keep as-is (plain text address)
    }
    return value;
  }

  // Fallback to string
  return String(value);
}

/**
 * GET /orders/history?user_id=...
 */
export function getOrderHistory(req, res) {
  let { user_id } = req.query;

  const safeUserId = Number(user_id);
  if (!safeUserId || Number.isNaN(safeUserId)) {
    user_id = 1;
  } else {
    user_id = safeUserId;
  }

  const sql = `
    SELECT
      o.order_id,
      o.order_date,
      o.total_amount,
      o.status        AS order_status,
      o.shipping_address,
      o.billing_address,
      d.delivery_status
    FROM orders o
    LEFT JOIN deliveries d ON d.order_id = o.order_id
    WHERE o.user_id = ?
    ORDER BY o.order_date DESC

  `;

  db.query(sql, [user_id], (err, rows) => {
    if (err) {
      console.error("Order history hatası:", err);
      return res.status(500).json({ error: "Sipariş geçmişi alınamadı" });
    }

    const orderIds = rows.map((r) => r.order_id);
    if (!orderIds.length) return res.json([]);

      const itemSql = `
    SELECT 
      oi.order_id,
      oi.order_item_id,
      oi.product_id,
      oi.quantity,
      oi.unit_price,
      COALESCE(p.product_name, CONCAT('Product #', oi.product_id)) AS product_name,
      p.product_image,
      p.product_price
    FROM order_items oi
    LEFT JOIN products p ON p.product_id = oi.product_id
    WHERE oi.order_id IN (?)
  `;

    db.query(itemSql, [orderIds], (itemErr, itemRows = []) => {
      if (itemErr) {
        console.error("Order items fetch failed:", itemErr);
        itemRows = [];
      }

      const itemMap = new Map();
      itemRows.forEach((row) => {
        const list = itemMap.get(row.order_id) || [];
        list.push({
          order_item_id: row.order_item_id,
          product_id: row.product_id,
          name: row.product_name,
          quantity: row.quantity,
          price: Number(row.unit_price) || 0,
          original_price: Number(row.product_price) || 0,
          image: row.product_image,
        });
        itemMap.set(row.order_id, list);
      });

    const normalizeStatus = (value) => {
      const normalized = String(value || "").toLowerCase();
      if (normalized.includes("refund_waiting") || normalized.includes("refund waiting") || normalized.includes("refund pending")) {
        return "Refund Waiting";
      }
      if (normalized.includes("refund_rejected") || normalized.includes("refund rejected")) {
        return "Refund Rejected";
      }
      if (normalized === "refunded") return "Refunded";
      if (normalized === "cancelled") return "Cancelled";
      if (normalized.includes("transit") || normalized === "shipped" || normalized === "in_transit") {
        return "In-transit";
      }
      if (normalized === "delivered") return "Delivered";
      return "Processing";
    };

    const normalized = rows.map((row) => ({
      order_id: row.order_id,
      order_date: row.order_date,
      total_amount: Number(row.total_amount) || 0,
      status: normalizeStatus(row.order_status),
      delivery_status: row.delivery_status,
      shipping_address: row.shipping_address,
      billing_address: row.billing_address,
      items: itemMap.get(row.order_id) || [],
    }));

      res.json(normalized);
    });
  });
}
/**
 * GET /orders
 * Returns orders with basic item details.
 * If query param user_id is provided (numeric), filters by that user.
 */
export function getAllOrders(req, res) {
  const userIdParam = Number(req.query.user_id);
  const hasUserFilter = Number.isFinite(userIdParam);

  const orderSql = `
    SELECT
      o.order_id,
      o.user_id,
      o.order_date,
      o.total_amount,
      o.status        AS order_status,
      o.shipping_address,
      o.billing_address,
      d.delivery_status,
      u.full_name     AS user_name,
      u.email         AS user_email
    FROM orders o
    LEFT JOIN deliveries d ON d.order_id = o.order_id
    LEFT JOIN users u ON u.user_id = o.user_id
    ${hasUserFilter ? "WHERE o.user_id = ?" : ""}
    ORDER BY o.order_date DESC
  `;

  const itemSql = `
    SELECT 
      oi.order_id,
      oi.order_item_id,
      oi.product_id,
      oi.quantity,
      oi.unit_price,
      COALESCE(p.product_name, CONCAT('Product #', oi.product_id)) AS product_name,
      p.product_image,
      p.product_price
    FROM order_items oi
    LEFT JOIN products p ON p.product_id = oi.product_id
  `;

  const normalizeStatus = (value) => {
    const normalized = String(value || "").toLowerCase();
    if (normalized.includes("refund_waiting") || normalized.includes("refund waiting") || normalized.includes("refund pending")) {
      return "Refund Waiting";
    }
    if (normalized.includes("refund_rejected") || normalized.includes("refund rejected")) {
      return "Refund Rejected";
    }
    if (normalized === "refunded") return "Refunded";
    if (normalized === "cancelled") return "Cancelled";
    if (normalized.includes("transit") || normalized === "shipped" || normalized === "in_transit") {
      return "In-transit";
    }
    if (normalized === "delivered") return "Delivered";
    return "Processing";
  };


  

  db.query(orderSql, hasUserFilter ? [userIdParam] : [], (orderErr, orderRows) => {
    if (orderErr) {
      console.error("All orders fetch failed:", orderErr);
      return res.json([]);
    }

    db.query(itemSql, (itemErr, itemRows) => {
      if (itemErr) {
        console.error("Order items fetch failed:", itemErr);
        // continue with empty items
        itemRows = [];
      }

      const itemMap = new Map();
      itemRows.forEach((row) => {
        const list = itemMap.get(row.order_id) || [];
        list.push({
          order_item_id: row.order_item_id,
          product_id: row.product_id,
          name: row.product_name,
          quantity: row.quantity,
          price: Number(row.unit_price) || 0,
          original_price: Number(row.product_price) || 0,
          image: row.product_image,
        });
        itemMap.set(row.order_id, list);
      });

      const normalized = orderRows.map((row) => {
        const status = normalizeStatus(row.order_status);
        return {
          order_id: row.order_id,
          user_id: row.user_id,
          user_name: row.user_name || `User ${row.user_id}`,
          user_email: row.user_email || null,
          date: row.order_date,
          total: Number(row.total_amount) || 0,
          status,
          delivery_status: row.delivery_status,
          shipping_address: row.shipping_address,
          billing_address: row.billing_address,
          updated_at: row.delivery_updated_at || null,
          items: itemMap.get(row.order_id) || [],
        };
      });

      res.json(normalized);
    });
  });
}


export function updateDeliveryStatus(req, res) {
  const { order_id } = req.params;
  const { status } = req.body;

  const normalized = String(status || "").toLowerCase();
  const allowed = ["preparing", "shipped", "in_transit", "delivered", "cancelled", "refunded", "refund_waiting", "refund_rejected"];
  const nextDeliveryStatus = allowed.includes(normalized) ? normalized : "preparing";

  const orderStatusMap = {
    preparing: "processing",
    shipped: "shipped",
    in_transit: "shipped",
    delivered: "delivered",
    cancelled: "cancelled",
    refunded: "refunded",
    refund_waiting: "refund_waiting",
    refund_rejected: "refund_rejected",
  };
  const nextOrderStatus = orderStatusMap[nextDeliveryStatus] || "placed";

  const sql = `
    UPDATE deliveries
    SET delivery_status = ?
    WHERE order_id = ?
  `;

  db.query(sql, [nextDeliveryStatus, order_id], (err) => {
    if (err) {
      console.error("Status update hatası:", err);
      return res.status(500).json({ error: "Durum güncellenemedi" });
    }

    db.query("UPDATE orders SET status = ? WHERE order_id = ?", [nextOrderStatus, order_id], (orderErr) => {
      if (orderErr) {
        console.error("Order status sync failed:", orderErr);
      }

      const shouldRestock = nextDeliveryStatus === "refunded";

      db.query(
        `
        SELECT 
          o.order_id,
          o.status AS order_status,
          d.delivery_status
        FROM orders o
        LEFT JOIN deliveries d ON d.order_id = o.order_id
        WHERE o.order_id = ?
      `,
        [order_id],
        (fetchErr, rows) => {
          if (fetchErr) {
            console.error("Status fetch failed:", fetchErr);
            return res.json({ success: true, delivery_status: nextDeliveryStatus });
          }
          const row = Array.isArray(rows) && rows.length ? rows[0] : {};
          if (shouldRestock) {
            db.query(
              `
              UPDATE products p
              JOIN order_items oi ON oi.product_id = p.product_id
              SET p.product_stock = p.product_stock + oi.quantity
              WHERE oi.order_id = ?
              `,
              [order_id],
              () => {
                sendOrderStatusEmail({ orderId: order_id, status: "refunded" });
                return res.json({ success: true, ...row, delivery_status: nextDeliveryStatus });
              }
            );
          } else {
            return res.json({ success: true, ...row, delivery_status: nextDeliveryStatus });
          }
        }
      );
    });
  });
}
export function cancelOrder(req, res) {
  const orderId = Number(req.params.id);

  if (!Number.isFinite(orderId)) {
    return res.status(400).json({ error: "Invalid order id" });
  }

  const checkSql = `
    SELECT o.status AS order_status, o.order_date, d.delivery_status
    FROM orders o
    LEFT JOIN deliveries d ON d.order_id = o.order_id
    WHERE o.order_id = ?
  `;

  db.query(checkSql, [orderId], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: "Cancel check failed" });
    }

    if (!rows.length) {
      return res.status(404).json({ error: "Order not found" });
    }

    const { order_status } = rows[0];

    // 🔥 ASIL KURAL
    if (order_status !== "processing") {
      return res.status(400).json({
        error: "Only processing orders can be cancelled"
      });
    }

    // orders → cancelled
    db.query(
      "UPDATE orders SET status = 'cancelled' WHERE order_id = ?",
      [orderId],
      () => {
        db.query(
          "UPDATE deliveries SET delivery_status = 'cancelled' WHERE order_id = ?",
          [orderId],
          () => {
            db.query(
              `
              UPDATE products p
              JOIN order_items oi ON oi.product_id = p.product_id
              SET p.product_stock = p.product_stock + oi.quantity
              WHERE oi.order_id = ?
              `,
              [orderId],
              () => {
                res.json({ success: true, order_id: orderId });
                sendOrderStatusEmail({ orderId, status: "cancelled" });
              }
            );
          }
        );
      }
    );
  });
}

export function refundOrder(req, res) {
  const orderId = Number(req.params.id);

  if (!Number.isFinite(orderId)) {
    return res.status(400).json({ error: "Invalid order id" });
  }

  const checkSql = `
    SELECT o.status AS order_status, o.order_date, d.delivery_status
    FROM orders o
    LEFT JOIN deliveries d ON d.order_id = o.order_id
    WHERE o.order_id = ?
  `;

  db.query(checkSql, [orderId], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: "Refund check failed" });
    }

    if (!rows.length) {
      return res.status(404).json({ error: "Order not found" });
    }

    const orderStatus = String(rows[0].order_status || "").toLowerCase();
    const deliveryStatus = String(rows[0].delivery_status || "").toLowerCase();

    if (["refunded", "refund_waiting", "refund_rejected"].includes(orderStatus) || ["refunded", "refund_waiting", "refund_rejected"].includes(deliveryStatus)) {
      return res.status(400).json({ error: "Refund already requested" });
    }

    if (orderStatus === "cancelled" || deliveryStatus === "cancelled") {
      return res.status(400).json({ error: "Cancelled orders cannot be refunded" });
    }

    const isDelivered = orderStatus === "delivered" || deliveryStatus === "delivered";

    if (!isDelivered) {
      return res.status(400).json({ error: "Only delivered orders can be refunded" });
    }

    const orderDate = rows[0].order_date ? new Date(rows[0].order_date) : null;
    if (orderDate && !Number.isNaN(orderDate.getTime())) {
      const diffDays = (Date.now() - orderDate.getTime()) / (24 * 60 * 60 * 1000);
      if (diffDays > 30) {
        return res.status(400).json({ error: "Refunds are only available within 30 days of delivery." });
      }
    }

    db.query("UPDATE orders SET status = 'refund_waiting' WHERE order_id = ?", [orderId], () => {
      db.query("UPDATE deliveries SET delivery_status = 'refund_waiting' WHERE order_id = ?", [orderId], () => {
        const insertReturnSql = `
          INSERT INTO return_requests (order_item_id, user_id, reason, status)
          SELECT oi.order_item_id, o.user_id, 'Order refund requested', 'requested'
          FROM order_items oi
          JOIN orders o ON o.order_id = oi.order_id
          LEFT JOIN return_requests rr
            ON rr.order_item_id = oi.order_item_id AND rr.status <> 'rejected'
          WHERE oi.order_id = ? AND rr.return_id IS NULL
        `;
        db.query(insertReturnSql, [orderId], (insertErr) => {
          if (insertErr) {
            console.error("Return request insert failed:", insertErr);
          }
          res.json({ success: true, order_id: orderId, status: "refund_waiting" });
        });
      });
    });
  });
}
