import db from "../db.js";

export function getCategories(req, res) {
  const sql = "SELECT category_id, name FROM categories ORDER BY name";
  db.query(sql, (err, rows) => {
    if (err) {
      console.error("Categories fetch failed:", err);
      return res.status(500).json({ error: "Categories could not be loaded" });
    }
    const data = (rows || []).map((row) => ({
      id: row.category_id,
      name: row.name,
    }));
    return res.json(data);
  });
}

export function createCategory(req, res) {
  const rawName = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const name = rawName.toLowerCase();

  if (!name) {
    return res.status(400).json({ error: "Category name is required" });
  }

  const selectSql = "SELECT MAX(category_id) AS maxId FROM categories";
  db.query(selectSql, (selectErr, rows) => {
    if (selectErr) {
      console.error("Category id lookup failed:", selectErr);
      return res.status(500).json({ error: "Category could not be created" });
    }

    const nextId = Number(rows?.[0]?.maxId || 0) + 1;
    const insertSql = "INSERT INTO categories (category_id, name) VALUES (?, ?)";
    db.query(insertSql, [nextId, name], (err) => {
      if (err) {
        if (err.code === "ER_DUP_ENTRY") {
          return res.status(409).json({ error: "Category already exists" });
        }
        console.error("Category create failed:", err);
        return res.status(500).json({ error: "Category could not be created" });
      }
      return res.status(201).json({ id: nextId, name });
    });
  });
}

export function deleteCategory(req, res) {
  const categoryId = Number(req.params.id);
  if (!Number.isFinite(categoryId)) {
    return res.status(400).json({ error: "Invalid category id" });
  }

  const lookupSql = "SELECT category_id, name FROM categories WHERE category_id = ? LIMIT 1";
  db.query(lookupSql, [categoryId], (lookupErr, rows = []) => {
    if (lookupErr) {
      console.error("Category lookup failed:", lookupErr);
      return res.status(500).json({ error: "Category lookup failed" });
    }
    if (!rows.length) {
      return res.status(404).json({ error: "Category not found" });
    }

    const categoryName = String(rows[0].name || "");
    const usageSql = "SELECT COUNT(*) AS total FROM products WHERE product_category = ?";
    db.query(usageSql, [categoryName], (usageErr, usageRows = []) => {
      if (usageErr) {
        console.error("Category usage check failed:", usageErr);
        return res.status(500).json({ error: "Category usage check failed" });
      }
      const usageCount = Number(usageRows?.[0]?.total || 0);
      if (usageCount > 0) {
        return res.status(400).json({ error: "Category is in use by products" });
      }

      db.query("DELETE FROM categories WHERE category_id = ?", [categoryId], (deleteErr) => {
        if (deleteErr) {
          console.error("Category delete failed:", deleteErr);
          return res.status(500).json({ error: "Category could not be deleted" });
        }
        return res.json({ success: true, id: categoryId });
      });
    });
  });
}
