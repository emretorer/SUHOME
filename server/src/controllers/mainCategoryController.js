import db from "../db.js";

export function getMainCategories(req, res) {
  const sql = "SELECT main_category_id, name FROM main_categories ORDER BY name";
  db.query(sql, (err, rows) => {
    if (err) {
      console.error("Main categories fetch failed:", err);
      return res.status(500).json({ error: "Main categories could not be loaded" });
    }
    const data = (rows || []).map((row) => ({
      id: row.main_category_id,
      name: row.name,
    }));
    return res.json(data);
  });
}

export function createMainCategory(req, res) {
  const rawName = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const name = rawName.toLowerCase();

  if (!name) {
    return res.status(400).json({ error: "Main category name is required" });
  }

  const selectSql = "SELECT MAX(main_category_id) AS maxId FROM main_categories";
  db.query(selectSql, (selectErr, rows) => {
    if (selectErr) {
      console.error("Main category id lookup failed:", selectErr);
      return res.status(500).json({ error: "Main category could not be created" });
    }

    const nextId = Number(rows?.[0]?.maxId || 0) + 1;
    const insertSql = "INSERT INTO main_categories (main_category_id, name) VALUES (?, ?)";
    db.query(insertSql, [nextId, name], (err) => {
      if (err) {
        if (err.code === "ER_DUP_ENTRY") {
          return res.status(409).json({ error: "Main category already exists" });
        }
        console.error("Main category create failed:", err);
        return res.status(500).json({ error: "Main category could not be created" });
      }
      return res.status(201).json({ id: nextId, name });
    });
  });
}

export function deleteMainCategory(req, res) {
  const categoryId = Number(req.params.id);
  if (!Number.isFinite(categoryId)) {
    return res.status(400).json({ error: "Invalid main category id" });
  }

  const lookupSql = "SELECT main_category_id, name FROM main_categories WHERE main_category_id = ? LIMIT 1";
  db.query(lookupSql, [categoryId], (lookupErr, rows = []) => {
    if (lookupErr) {
      console.error("Main category lookup failed:", lookupErr);
      return res.status(500).json({ error: "Main category lookup failed" });
    }
    if (!rows.length) {
      return res.status(404).json({ error: "Main category not found" });
    }

    const productsSql = "SELECT DISTINCT product_id FROM product_main_categories WHERE main_category_id = ?";
    db.query(productsSql, [categoryId], (productErr, productRows = []) => {
      if (productErr) {
        console.error("Main category product lookup failed:", productErr);
        return res.status(500).json({ error: "Main category could not be deleted" });
      }
      const affectedProductIds = productRows.map((row) => row.product_id);

      db.query("DELETE FROM main_categories WHERE main_category_id = ?", [categoryId], (deleteErr) => {
        if (deleteErr) {
          console.error("Main category delete failed:", deleteErr);
          return res.status(500).json({ error: "Main category could not be deleted" });
        }
        if (!affectedProductIds.length) {
          return res.json({ success: true, id: categoryId });
        }

        const placeholders = affectedProductIds.map(() => "?").join(",");
        const updateSql = `
          UPDATE products p
          LEFT JOIN (
            SELECT
              pmc.product_id,
              GROUP_CONCAT(DISTINCT mc.name ORDER BY mc.name SEPARATOR ', ') AS main_categories
            FROM product_main_categories pmc
            JOIN main_categories mc ON mc.main_category_id = pmc.main_category_id
            GROUP BY pmc.product_id
          ) mcats ON mcats.product_id = p.product_id
          SET p.product_main_category = mcats.main_categories
          WHERE p.product_id IN (${placeholders})
        `;
        db.query(updateSql, affectedProductIds, (updateErr) => {
          if (updateErr) {
            console.error("Main category product update failed:", updateErr);
          }
          return res.json({ success: true, id: categoryId });
        });
      });
    });
  });
}
