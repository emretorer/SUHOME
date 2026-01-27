// server/src/controllers/cartController.js
import db from "../db.js";

/**
 * Yardımcı: varsayılan cart'ı bulur, yoksa oluşturur.
 * callback(err, cartId)
 */
function getOrCreateDefaultCart(callback) {
  const findCartSql = "SELECT cart_id FROM carts LIMIT 1";

  db.query(findCartSql, (err, rows) => {
    if (err) {
      console.error("Cart aranırken hata:", err);
      return callback(err);
    }

    // hiç cart yoksa yenisini oluştur
    if (rows.length === 0) {
      const insertCartSql =
        "INSERT INTO carts (cart_token, created_at) VALUES (?, NOW())";

      db.query(insertCartSql, ["default-cart"], (err2, result2) => {
        if (err2) {
          console.error("Cart oluşturulamadı:", err2);
          return callback(err2);
        }

        const newCartId = result2.insertId;
        callback(null, newCartId);
      });
    } else {
      const existingCartId = rows[0].cart_id;
      callback(null, existingCartId);
    }
  });
}

/**
 * GET /cart
 * Sepeti ürün bilgisi + fiyat + stok ile getirir
 */
export function getCart(req, res) {
  const sql = `
    SELECT 
      ci.cart_item_id,
      ci.cart_id,
      ci.product_id,
      ci.quantity,
      ci.unit_price,
      p.product_name,
      p.product_image,
      p.product_stock
    FROM cart_items ci
    JOIN products p ON ci.product_id = p.product_id
    ORDER BY ci.cart_item_id ASC
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error("Cart alınamadı:", err);
      return res.status(500).json({ error: "Veri alınamadı" });
    }

    const items = results.map((row) => {
      const price = Number(row.unit_price ?? row.product_price ?? 0);
      return {
        id: row.cart_item_id,
        cart_id: row.cart_id,
        product_id: row.product_id,
        name: row.product_name,
        price,
        stock: Number(row.product_stock ?? 0),
        quantity: row.quantity,
        image: row.product_image,
        line_total: price * row.quantity,
      };
    });

    const total = items.reduce((sum, it) => sum + it.line_total, 0);

    res.json({ items, total });
  });
}

/**
 * POST /cart
 * Body: { product_id, quantity }
 *
 * Sepete tek bir ürün ekler (gerekirse cart oluşturur),
 * cart_items'a unit_price ile beraber yazar.
 */
export function addToCart(req, res) {
  const { product_id, quantity } = req.body;

  if (!product_id || !quantity || Number(quantity) <= 0) {
    return res
      .status(400)
      .json({ error: "product_id ve quantity (>0) zorunludur" });
  }

  // 1) Ürünü ve fiyatını bul
  const findProductSql = `
    SELECT
      p.product_price,
      p.product_stock,
      p.product_name,
      COALESCE(disc.discount_amount, 0) AS discount_amount,
      GREATEST(p.product_price - COALESCE(disc.discount_amount, 0), 0) AS discounted_price
    FROM products p
    LEFT JOIN (
      SELECT 
        dp.product_id,
        MAX(
          CASE d.type
            WHEN 'rate' THEN p2.product_price * d.value / 100
            WHEN 'amount' THEN d.value
            ELSE 0
          END
        ) AS discount_amount
      FROM discount_products dp
      JOIN discounts d ON d.discount_id = dp.discount_id
      JOIN products p2 ON p2.product_id = dp.product_id
      WHERE d.status = 'active'
        AND dp.is_active = 1
        AND NOW() BETWEEN d.start_at AND d.end_at
      GROUP BY dp.product_id
    ) disc ON disc.product_id = p.product_id
    WHERE p.product_id = ?
 `;

  db.query(findProductSql, [product_id], (err, rows) => {
    if (err) {
      console.error("Ürün sorgulanamadı:", err);
      return res.status(500).json({ error: "Ürün okunamadı" });
    }

    if (rows.length === 0) {
      return res.status(404).json({ error: "Ürün bulunamadı" });
    }

    const product = rows[0];
    const price = Number(
      product.discounted_price ?? product.product_price ?? 0
    );
    const stock = Number(product.product_stock);

    if (stock < quantity) {
      return res.status(400).json({ error: "Yeterli stok yok" });
    }

    // 2) Cart'ı bul ya da oluştur
    getOrCreateDefaultCart((errCart, cartId) => {
      if (errCart) {
        return res
          .status(500)
          .json({ error: "Sepet bulunamadı / oluşturulamadı" });
      }

      // 3) cart_items'a ekle
      const insertItemSql = `
        INSERT INTO cart_items (cart_id, product_id, quantity, unit_price)
        VALUES (?, ?, ?, ?)
      `;

      db.query(
        insertItemSql,
        [cartId, product_id, quantity, price],
        (errInsert, result) => {
          if (errInsert) {
            console.error("Ürün sepete eklenemedi:", errInsert);
            return res.status(500).json({ error: "Ekleme başarısız" });
          }

          res.json({
            message: "Ürün sepete eklendi",
            cart_item_id: result.insertId,
            cart_id: cartId,
            product_id,
            quantity,
            unit_price: price,
          });
        }
      );
    });
  });
}

/**
 * POST /cart/sync
 * Body: { items: [ { product_id, quantity }, ... ] }
 *
 * Frontend’deki sepeti tamamen DB ile senkronlar:
 *  - Cart'ı bulur/oluşturur
 *  - O cart'a ait tüm cart_items kayıtlarını siler
 *  - Gönderilen items listesine göre yeniden yazar
 */
export function syncCart(req, res) {
  const { items } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Sepet boş, sync yapılamaz" });
  }

  // 1) Cart'ı bul / oluştur
  getOrCreateDefaultCart((errCart, cartId) => {
    if (errCart) {
      return res
        .status(500)
        .json({ error: "Sepet bulunamadı / oluşturulamadı" });
    }

    // 2) Bu cart'a ait eski kayıtları sil
    db.query(
      "DELETE FROM cart_items WHERE cart_id = ?",
      [cartId],
      (errDel) => {
        if (errDel) {
          console.error("Cart temizlenemedi:", errDel);
          return res.status(500).json({ error: "Sepet temizlenemedi" });
        }

        let pending = items.length;
        if (pending === 0) {
          return res.json({ success: true, cart_id: cartId, items: [] });
        }

        items.forEach((it) => {
          const product_id = it.product_id;
          const quantity = Number(it.quantity ?? 1);

          if (!product_id || quantity <= 0) {
            if (--pending === 0) {
              return res.json({ success: true, cart_id: cartId });
            }
            return;
          }

          // Her ürün için fiyatı products tablosundan al
          const productSql = `
            SELECT
              p.product_price,
              COALESCE(disc.discount_amount, 0) AS discount_amount,
              GREATEST(p.product_price - COALESCE(disc.discount_amount, 0), 0) AS discounted_price
            FROM products p
            LEFT JOIN (
              SELECT 
                dp.product_id,
                MAX(
                  CASE d.type
                    WHEN 'rate' THEN p2.product_price * d.value / 100
                    WHEN 'amount' THEN d.value
                    ELSE 0
                  END
                ) AS discount_amount
              FROM discount_products dp
              JOIN discounts d ON d.discount_id = dp.discount_id
              JOIN products p2 ON p2.product_id = dp.product_id
              WHERE d.status = 'active'
                AND dp.is_active = 1
                AND NOW() BETWEEN d.start_at AND d.end_at
              GROUP BY dp.product_id
            ) disc ON disc.product_id = p.product_id
            WHERE p.product_id = ?
          `;

          db.query(productSql, [product_id], (errP, rowsP) => {
            if (errP || rowsP.length === 0) {
              console.error("Sync sırasında ürün bulunamadı:", errP || "yok");
              if (--pending === 0) {
                return res.json({
                  success: true,
                  cart_id: cartId,
                  warning: "Bazı ürünler bulunamadı",
                });
              }
              return;
            }

            const price = Number(
              rowsP[0].discounted_price ?? rowsP[0].product_price ?? 0
            );

            const insertSql = `
              INSERT INTO cart_items (cart_id, product_id, quantity, unit_price)
              VALUES (?, ?, ?, ?)
            `;

            db.query(
              insertSql,
              [cartId, product_id, quantity, price],
              (errI) => {
                if (errI) {
                  console.error("Sync insert hatası:", errI);
                }

                if (--pending === 0) {
                  return res.json({ success: true, cart_id: cartId });
                }
              }
            );
          });
        });
      }
    );
  });
}

/**
 * DELETE /cart/:id
 * Tek bir cart_item kaydını siler
 */
export function deleteCartItem(req, res) {
  const { id } = req.params;

  db.query(
    "DELETE FROM cart_items WHERE cart_item_id = ?",
    [id],
    (err, result) => {
      if (err) {
        console.error("Silinemedi:", err);
        return res.status(500).json({ error: "Silme başarısız" });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: "Kayıt bulunamadı" });
      }

      res.json({ message: "Silindi", id });
    }
  );
}
