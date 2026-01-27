import db from "../db.js";
import { encryptString } from "../utils/encryption.js";

function pickValue(req, key) {
  return req.body?.[key] ?? req.query?.[key];
}

export function createPayment(req, res) {
  const orderId = Number(pickValue(req, "order_id"));
  const userId = Number(pickValue(req, "user_id"));
  const amount = Number(pickValue(req, "amount"));
  const method = String(pickValue(req, "method") || "").toLowerCase();
  const status = String(pickValue(req, "status") || "initiated").toLowerCase();
  const transactionRef = pickValue(req, "transaction_ref") ?? null;
  const paidAtRaw = pickValue(req, "paid_at");
  const cardName = pickValue(req, "card_name");
  const cardNumber = pickValue(req, "card_number");
  const cardExpiry = pickValue(req, "card_expiry");

  if (!Number.isFinite(orderId) || !Number.isFinite(userId) || !Number.isFinite(amount)) {
    return res.status(400).json({ error: "order_id, user_id, amount required" });
  }
  if (!method) {
    return res.status(400).json({ error: "method required" });
  }

  const paidAt = paidAtRaw ? new Date(paidAtRaw) : null;
  if (paidAtRaw && Number.isNaN(paidAt.getTime())) {
    return res.status(400).json({ error: "paid_at invalid" });
  }

  let cardHolderEnc = null;
  let cardNumberEnc = null;
  let cardExpiryEnc = null;
  let cardLast4 = null;
  if (cardNumber) {
    const digits = String(cardNumber).replace(/\D/g, "");
    cardLast4 = digits.slice(-4);
    try {
      cardNumberEnc = encryptString(digits);
    } catch (error) {
      console.warn("Card number encryption skipped:", error?.message || error);
    }
  }
  if (cardName) {
    try {
      cardHolderEnc = encryptString(cardName);
    } catch (error) {
      console.warn("Card holder encryption skipped:", error?.message || error);
    }
  }
  if (cardExpiry) {
    try {
      cardExpiryEnc = encryptString(cardExpiry);
    } catch (error) {
      console.warn("Card expiry encryption skipped:", error?.message || error);
    }
  }

  const sqlWithCard = `
    INSERT INTO payments (
      order_id,
      user_id,
      amount,
      method,
      status,
      paid_at,
      transaction_ref,
      card_holder_enc,
      card_number_enc,
      card_expiry_enc,
      card_last4
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  const sqlWithoutCard = `
    INSERT INTO payments (order_id, user_id, amount, method, status, paid_at, transaction_ref)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  const insertPayment = () => {
    db.query(
      sqlWithCard,
      [
        orderId,
        userId,
        amount,
        method,
        status,
        paidAt,
        transactionRef,
        cardHolderEnc,
        cardNumberEnc,
        cardExpiryEnc,
        cardLast4,
      ],
      (err, result) => {
        if (err) {
          if (err.code === "ER_DUP_ENTRY" && transactionRef) {
            const lookupSql = `
              SELECT payment_id
              FROM payments
              WHERE order_id = ? AND transaction_ref = ?
              LIMIT 1
            `;
            db.query(lookupSql, [orderId, transactionRef], (lookupErr, lookupRows) => {
              if (lookupErr) {
                console.error("Payment lookup failed:", lookupErr);
                return res.status(500).json({ error: "Payment insert failed" });
              }
              if (lookupRows && lookupRows.length > 0) {
                return res.json({ success: true, payment_id: lookupRows[0].payment_id });
              }
              console.error("Payment insert failed:", err);
              return res.status(500).json({ error: "Payment insert failed" });
            });
            return;
          }
          if (err.code === "ER_BAD_FIELD_ERROR") {
            db.query(
              sqlWithoutCard,
              [orderId, userId, amount, method, status, paidAt, transactionRef],
              (fallbackErr, fallbackResult) => {
                if (fallbackErr) {
                  console.error("Payment insert failed:", fallbackErr);
                  return res.status(500).json({ error: "Payment insert failed" });
                }
                return res.json({ success: true, payment_id: fallbackResult.insertId });
              }
            );
            return;
          }
          console.error("Payment insert failed:", err);
          return res.status(500).json({ error: "Payment insert failed" });
        }
        return res.json({ success: true, payment_id: result.insertId });
      }
    );
  };

  if (transactionRef) {
    const dedupeSql = `
      SELECT payment_id
      FROM payments
      WHERE order_id = ? AND transaction_ref = ?
      LIMIT 1
    `;
    db.query(dedupeSql, [orderId, transactionRef], (checkErr, rows) => {
      if (checkErr) {
        console.error("Payment dedupe check failed:", checkErr);
        return insertPayment();
      }
      if (rows && rows.length > 0) {
        return res.json({ success: true, payment_id: rows[0].payment_id });
      }
      return insertPayment();
    });
    return;
  }

  return insertPayment();
}
