// server/src/controllers/productController.js
import db from "../db.js";

function normalizeMainCategories(input) {
  if (Array.isArray(input)) {
    return input
      .map((value) => String(value || "").trim().toLowerCase())
      .filter(Boolean);
  }
  if (typeof input === "string") {
    return input
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
  }
  return [];
}

function parseMainCategoryList(value) {
  if (!value) return [];
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function getAllProducts(req, res) {
  const sql = `
    SELECT 
      p.*,
      mcats.main_categories,
      COALESCE(stats.avg_rating, 0)   AS avg_rating,
      COALESCE(stats.rating_count, 0) AS rating_count,
      COALESCE(disc.discount_amount, 0) AS discount_amount,
      GREATEST(p.product_price - COALESCE(disc.discount_amount, 0), 0) AS discounted_price
    FROM products p
    LEFT JOIN (
      SELECT
        pmc.product_id,
        GROUP_CONCAT(DISTINCT mc.name ORDER BY mc.name SEPARATOR ',') AS main_categories
      FROM product_main_categories pmc
      JOIN main_categories mc ON mc.main_category_id = pmc.main_category_id
      GROUP BY pmc.product_id
    ) mcats ON mcats.product_id = p.product_id
    LEFT JOIN (
      SELECT 
        product_id,
        AVG(rating)   AS avg_rating,
        COUNT(*)      AS rating_count
      FROM comments
      WHERE rating IS NOT NULL AND (status IS NULL OR status <> 'rejected')
      GROUP BY product_id
    ) stats ON stats.product_id = p.product_id
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
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error("❌ Ürünler alınamadı:", err);
      return res.status(500).json({ error: "Veritabanı hatası" });
    }

    const normalized = results.map((p) => {
      const basePrice = Number(p.product_price);
      const discountedPrice = Number(p.discounted_price ?? basePrice);
      return {
        id: p.product_id,
        name: p.product_name,
        model: p.product_model ?? p.model ?? null,
        serialNumber: p.product_serial_number ?? p.serial_number ?? null,
        description: p.product_features,
        price: discountedPrice,
        originalPrice: basePrice,
        stock: Number(p.product_stock),
        category: p.product_category,
        mainCategory: parseMainCategoryList(p.main_categories || p.product_main_category),
        material: p.product_material,
        color: p.product_color,
        image: p.product_image,
        rating: p.avg_rating ?? p.product_rating ?? 0,
        averageRating: p.avg_rating ?? p.product_rating ?? 0,
        ratingCount: Number(p.rating_count ?? 0),
        warranty: p.product_warranty ?? p.warranty ?? null,
        distributor: p.product_distributor ?? p.distributor ?? null,
      };
    });

    res.json(normalized);
  });
}

export function createProduct(req, res) {
  const payload = req.body || {};
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  const rawModel = typeof payload.model === "string" ? payload.model.trim() : "";
  const rawCategory = typeof payload.category === "string" ? payload.category.trim() : "";
  const mainCategories = normalizeMainCategories(payload.mainCategory);
  const rawDescription = typeof payload.features === "string"
    ? payload.features.trim()
    : typeof payload.description === "string"
    ? payload.description.trim()
    : "";
  const rawMaterial = typeof payload.material === "string" ? payload.material.trim() : "";
  const rawColor = typeof payload.color === "string" ? payload.color.trim() : "";
  const rawWarranty = typeof payload.warranty === "string" ? payload.warranty.trim() : "";
  const rawDistributor = typeof payload.distributor === "string" ? payload.distributor.trim() : "";
  const rawImage = typeof payload.image === "string" ? payload.image.trim() : "";

  const price = Number(payload.price);
  const stock = payload.stock === "" || payload.stock == null ? 0 : Number(payload.stock);

  if (!name) {
    return res.status(400).json({ error: "Product name is required" });
  }
  if (!Number.isFinite(price) || price < 0) {
    return res.status(400).json({ error: "Valid product price is required" });
  }
  if (!Number.isFinite(stock) || stock < 1) {
    return res.status(400).json({ error: "Valid product stock (>=1) is required" });
  }

  const selectIdSql = "SELECT MAX(product_id) AS maxId FROM products";
  db.query(selectIdSql, (selectErr, rows) => {
    if (selectErr) {
      console.error("Product id lookup failed:", selectErr);
      return res.status(500).json({ error: "Product could not be created" });
    }

    const nextId = Number(rows?.[0]?.maxId || 0) + 1;
    const serialNumber = `SN-${nextId}-2026`;
    const mainCategoryValue = mainCategories.join(", ");
    const sql = `
      INSERT INTO products
        (product_id, product_name, product_model, product_serial_number, product_main_category, product_category,
         product_material, product_color, product_warranty, product_distributor, product_features,
         product_stock, product_price, product_image)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      nextId,
      name,
      rawModel || null,
      serialNumber,
      mainCategoryValue || null,
      rawCategory || null,
      rawMaterial || null,
      rawColor || null,
      rawWarranty || null,
      rawDistributor || null,
      rawDescription || null,
      stock,
      price,
      rawImage || null,
    ];

    db.query(sql, values, (err) => {
      if (err) {
        console.error("Product create failed:", err);
        return res.status(500).json({ error: "Product could not be created" });
      }

      if (!mainCategories.length) {
        const created = {
          id: nextId,
          name,
          model: rawModel || null,
          serialNumber,
          description: rawDescription || null,
          price,
          originalPrice: price,
          stock,
          category: rawCategory || null,
          mainCategory: [],
          material: rawMaterial || null,
          color: rawColor || null,
          warranty: rawWarranty || null,
          distributor: rawDistributor || null,
          image: rawImage || null,
          rating: 0,
          averageRating: 0,
          ratingCount: 0,
        };
        return res.status(201).json(created);
      }

      const placeholders = mainCategories.map(() => "?").join(",");
      const lookupSql = `SELECT main_category_id, name FROM main_categories WHERE name IN (${placeholders})`;
      db.query(lookupSql, mainCategories, (lookupErr, rows = []) => {
        if (lookupErr) {
          console.error("Main categories lookup failed:", lookupErr);
          return res.status(500).json({ error: "Product could not be created" });
        }
        const idMap = new Map(rows.map((row) => [String(row.name), row.main_category_id]));
        const inserts = mainCategories
          .map((nameValue) => [nextId, idMap.get(String(nameValue))])
          .filter((pair) => pair[1]);
        if (!inserts.length) {
          const created = {
            id: nextId,
            name,
            model: rawModel || null,
            serialNumber,
            description: rawDescription || null,
            price,
            originalPrice: price,
            stock,
            category: rawCategory || null,
            mainCategory: [],
            material: rawMaterial || null,
            color: rawColor || null,
            warranty: rawWarranty || null,
            distributor: rawDistributor || null,
            image: rawImage || null,
            rating: 0,
            averageRating: 0,
            ratingCount: 0,
          };
          return res.status(201).json(created);
        }
        db.query(
          "INSERT INTO product_main_categories (product_id, main_category_id) VALUES ?",
          [inserts],
          (insertErr) => {
            if (insertErr) {
              console.error("Product main categories insert failed:", insertErr);
              return res.status(500).json({ error: "Product could not be created" });
            }
            const created = {
              id: nextId,
              name,
              model: rawModel || null,
              serialNumber,
              description: rawDescription || null,
              price,
              originalPrice: price,
              stock,
              category: rawCategory || null,
              mainCategory: mainCategories,
              material: rawMaterial || null,
              color: rawColor || null,
              warranty: rawWarranty || null,
              distributor: rawDistributor || null,
              image: rawImage || null,
              rating: 0,
              averageRating: 0,
              ratingCount: 0,
            };

            return res.status(201).json(created);
          }
        );
      });
    });
  });
}

export function updateProductStock(req, res) {
  const { id } = req.params;
  let { amount } = req.body;

  // amount zorunlu
  amount = Number(amount);
  if (!Number.isFinite(amount) || amount === 0) {
    return res.status(400).json({ error: "amount missing or invalid" });
  }

  // 🔽 Stok azaltma (amount < 0) -> stok yetiyor mu kontrol et
  if (amount < 0) {
    const need = Math.abs(amount);

    const sql = `
      UPDATE products
      SET product_stock = product_stock + ?
      WHERE product_id = ? AND product_stock >= ?
    `;

    db.query(sql, [amount, id, need], (err, result) => {
      if (err) {
        console.error("Stock update failed:", err);
        return res.status(500).json({ error: "Stock update failed" });
      }

      // etkilenen satır yoksa stok yetmedi
      if (result.affectedRows === 0) {
        return res.status(400).json({ error: "Not enough stock" });
      }

      return res.json({ success: true });
    });
  } else {
    // 🔼 Stok arttırma (iade, admin panel vs.)
    const sql = `
      UPDATE products
      SET product_stock = product_stock + ?
      WHERE product_id = ?
    `;

    db.query(sql, [amount, id], (err) => {
      if (err) {
        console.error("Stock update failed:", err);
        return res.status(500).json({ error: "Stock update failed" });
      }
      return res.json({ success: true });
    });
  }
}

export function updateProduct(req, res) {
  const { id } = req.params;
  const payload = req.body || {};
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  const rawModel = typeof payload.model === "string" ? payload.model.trim() : "";
  const serialProvided = typeof payload.serialNumber === "string";
  const rawSerialNumber = serialProvided ? payload.serialNumber.trim() : null;
  const rawCategory = typeof payload.category === "string" ? payload.category.trim() : "";
  const mainCategoryProvided = payload.mainCategory !== undefined;
  const mainCategories = normalizeMainCategories(payload.mainCategory);
  const rawDescription = typeof payload.features === "string" ? payload.features.trim() : "";
  const rawMaterial = typeof payload.material === "string" ? payload.material.trim() : "";
  const rawColor = typeof payload.color === "string" ? payload.color.trim() : "";
  const rawWarranty = typeof payload.warranty === "string" ? payload.warranty.trim() : "";
  const rawDistributor = typeof payload.distributor === "string" ? payload.distributor.trim() : "";
  const rawImage = typeof payload.image === "string" ? payload.image.trim() : "";

  const priceProvided = payload.price !== undefined && payload.price !== null && payload.price !== "";
  const price = priceProvided ? Number(payload.price) : null;
  const stockProvided = payload.stock !== undefined && payload.stock !== null && payload.stock !== "";
  const stock = stockProvided ? Number(payload.stock) : null;

  if (!name) {
    return res.status(400).json({ error: "Product name is required" });
  }
  if (priceProvided && (!Number.isFinite(price) || price < 0)) {
    return res.status(400).json({ error: "Valid product price is required" });
  }
  if (stockProvided && (!Number.isFinite(stock) || stock < 1)) {
    return res.status(400).json({ error: "Valid product stock (>=1) is required" });
  }

  const sql = `
    UPDATE products
    SET
      product_name = ?,
      product_model = ?,
      product_serial_number = COALESCE(?, product_serial_number),
      product_main_category = COALESCE(?, product_main_category),
      product_category = ?,
      product_material = ?,
      product_color = ?,
      product_warranty = ?,
      product_distributor = ?,
      product_features = ?,
      product_stock = COALESCE(?, product_stock),
      product_price = COALESCE(?, product_price),
      product_image = ?
    WHERE product_id = ?
  `;

  const values = [
    name,
    rawModel || null,
    serialProvided ? (rawSerialNumber || null) : null,
    mainCategoryProvided ? mainCategories.join(", ") || null : null,
    rawCategory || null,
    rawMaterial || null,
    rawColor || null,
    rawWarranty || null,
    rawDistributor || null,
    rawDescription || null,
    stockProvided ? stock : null,
    priceProvided ? price : null,
    rawImage || null,
    id,
  ];

  db.query(sql, values, (err, result) => {
    if (err) {
      console.error("Product update failed:", err);
      return res.status(500).json({ error: "Product could not be updated" });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Product not found" });
    }
    if (!mainCategoryProvided) {
      return res.json({ success: true });
    }

    db.query("DELETE FROM product_main_categories WHERE product_id = ?", [id], (deleteErr) => {
      if (deleteErr) {
        console.error("Product main categories delete failed:", deleteErr);
        return res.status(500).json({ error: "Product could not be updated" });
      }
      if (!mainCategories.length) {
        return res.json({ success: true });
      }
      const placeholders = mainCategories.map(() => "?").join(",");
      const lookupSql = `SELECT main_category_id, name FROM main_categories WHERE name IN (${placeholders})`;
      db.query(lookupSql, mainCategories, (lookupErr, rows = []) => {
        if (lookupErr) {
          console.error("Main categories lookup failed:", lookupErr);
          return res.status(500).json({ error: "Product could not be updated" });
        }
        const idMap = new Map(rows.map((row) => [String(row.name), row.main_category_id]));
        const inserts = mainCategories
          .map((nameValue) => [Number(id), idMap.get(String(nameValue))])
          .filter((pair) => pair[1]);
        if (!inserts.length) {
          return res.json({ success: true });
        }
        db.query(
          "INSERT INTO product_main_categories (product_id, main_category_id) VALUES ?",
          [inserts],
          (insertErr) => {
            if (insertErr) {
              console.error("Product main categories insert failed:", insertErr);
              return res.status(500).json({ error: "Product could not be updated" });
            }
            return res.json({ success: true });
          }
        );
      });
    });
  });
}

export function deleteProduct(req, res) {
  const { id } = req.params;
  const sql = "DELETE FROM products WHERE product_id = ?";
  db.query(sql, [id], (err, result) => {
    if (err) {
      console.error("Product delete failed:", err);
      return res.status(500).json({ error: "Product could not be deleted" });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Product not found" });
    }
    return res.json({ success: true });
  });
}

export function getProductById(req, res) {
  const { id } = req.params;

  const sql = `
    SELECT 
      p.*,
      mcats.main_categories,
      COALESCE(stats.avg_rating, 0)   AS avg_rating,
      COALESCE(stats.rating_count, 0) AS rating_count,
      COALESCE(disc.discount_amount, 0) AS discount_amount,
      GREATEST(p.product_price - COALESCE(disc.discount_amount, 0), 0) AS discounted_price
    FROM products p
    LEFT JOIN (
      SELECT
        pmc.product_id,
        GROUP_CONCAT(DISTINCT mc.name ORDER BY mc.name SEPARATOR ',') AS main_categories
      FROM product_main_categories pmc
      JOIN main_categories mc ON mc.main_category_id = pmc.main_category_id
      GROUP BY pmc.product_id
    ) mcats ON mcats.product_id = p.product_id
    LEFT JOIN (
      SELECT 
        product_id,
        AVG(rating)   AS avg_rating,
        COUNT(*)      AS rating_count
      FROM comments
      WHERE rating IS NOT NULL AND (status IS NULL OR status <> 'rejected')
      GROUP BY product_id
    ) stats ON stats.product_id = p.product_id
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

  db.query(sql, [id], (err, results) => {
    if (err) {
      console.error("❌ Ürün alınamadı:", err);
      return res.status(500).json({ error: "Veritabanı hatası" });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: "Ürün bulunamadı" });
    }

    const p = results[0];

    const basePrice = Number(p.product_price);
    const discountedPrice = Number(p.discounted_price ?? basePrice);
    const normalized = {
      id: p.product_id,
      name: p.product_name,
      model: p.product_model ?? p.model ?? null,
      serialNumber: p.product_serial_number ?? p.serial_number ?? null,
      description: p.product_features,
      price: discountedPrice,
      originalPrice: basePrice,
      stock: Number(p.product_stock),
      category: p.product_category,
      mainCategory: parseMainCategoryList(p.main_categories || p.product_main_category),
      material: p.product_material,
      color: p.product_color,
      image: p.product_image,
      rating: p.avg_rating ?? p.product_rating ?? 0,
      averageRating: p.avg_rating ?? p.product_rating ?? 0,
      ratingCount: Number(p.rating_count ?? 0),
      warranty: p.product_warranty ?? p.warranty ?? null,
      distributor: p.product_distributor ?? p.distributor ?? null,
    };

    res.json(normalized);
  });
}
