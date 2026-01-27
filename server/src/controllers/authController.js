import bcrypt from "bcryptjs";
import db from "../db.js";
import crypto from "node:crypto";
import { sendMail } from "../utils/mailer.js";

const demoUsers = {
  "test@suhome.com": { name: "Demo User", password: "1234", role: "customer" },
  "demo1@suhome.com": { name: "Product Manager", password: "demo1pass", role: "product_manager" },
  "demo2@suhome.com": { name: "Sales Manager", password: "demo2pass", role: "sales_manager" },
  "support@suhome.com": { name: "Support Agent 1", password: "support", role: "support" },
  "support2@suhome.com": { name: "Support Agent 2", password: "support", role: "support" },
  "support3@suhome.com": { name: "Support Agent 3", password: "support", role: "support" },
  "support4@suhome.com": { name: "Support Agent 4", password: "support", role: "support" },
  "support5@suhome.com": { name: "Support Agent 5", password: "support", role: "support" },
};

function buildDemoTaxId(email) {
  const hash = crypto.createHash("sha256").update(email).digest("hex");
  const digits = hash.replace(/[a-f]/g, (char) => String(parseInt(char, 16) % 10));
  return digits.slice(0, 11).padEnd(11, "0");
}

const RESET_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS password_resets (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    token_hash VARCHAR(255) NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_reset_token (token_hash),
    FOREIGN KEY (user_id) REFERENCES users(user_id)
      ON UPDATE CASCADE ON DELETE CASCADE
  )
`;

db.query(RESET_TABLE_SQL, (err) => {
  if (err) {
    console.error("password_resets table init failed:", err);
  }
});

function normalizeUser(row) {
  return {
    id: row.user_id,
    email: row.email,
    name: row.full_name || "User",
    address: row.home_address || "",
    taxId: row.tax_id || "",
    role: row.role_name || row.role || "customer",
  };
}

async function upsertDemoUser(email) {
  const demo = demoUsers[email.toLowerCase()];
  if (!demo) return null;
  const hashed = await bcrypt.hash(demo.password, 10);
  return new Promise((resolve, reject) => {
    const sql = `
      INSERT INTO users (full_name, email, password_hash, tax_id, home_address)
      VALUES (?, ?, ?, ?, '')
      ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)
    `;
    const taxId = buildDemoTaxId(email);
    db.query(sql, [demo.name, email, hashed, taxId], (err, result) => {
      if (err) return reject(err);
      resolve({ id: result.insertId || null, role: demo.role, name: demo.name });
    });
  });
}

function hashToken(rawToken) {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

export function register(req, res) {
  const { fullName, email, password, taxId } = req.body;
  const normalizedTaxId = typeof taxId === "string" ? taxId.trim() : "";

  if (!fullName || !email || !password || !normalizedTaxId) {
    return res.status(400).json({ error: "fullname, email, password ve tax_id zorunlu" });
  }

  const checkSql = "SELECT user_id, email, tax_id FROM users WHERE email = ? OR tax_id = ?";
  db.query(checkSql, [email, normalizedTaxId], async (checkErr, rows) => {
    if (checkErr) {
      console.error("User lookup failed:", checkErr);
      return res.status(500).json({ error: "Kay??t s??ras??nda hata olu?Ytu" });
    }
    if (rows.length > 0) {
      const emailMatch = rows.find((row) => row.email === email);
      if (emailMatch) {
        return res.status(400).json({ error: "Bu email zaten kay??tl??" });
      }
      return res.status(400).json({ error: "Bu tax ID zaten kay??tl??" });
    }

    try {
      const hashed = await bcrypt.hash(password, 10);
      const insertSql = `
        INSERT INTO users (full_name, email, password_hash, tax_id, home_address)
        VALUES (?, ?, ?, ?, ?)
      `;
      db.query(insertSql, [fullName, email, hashed, normalizedTaxId, ""], (insErr, result) => {
        if (insErr) {
          console.error("User insert failed:", insErr);
          return res.status(500).json({ error: "Kay??t ba?Yar??s??z" });
        }
        return res.json({
          success: true,
          user: {
            id: result.insertId,
            email,
            name: fullName,
            address: "",
            taxId: normalizedTaxId,
            role: "customer",
          },
        });
      });
    } catch (hashErr) {
      console.error("Password hash failed:", hashErr);
      return res.status(500).json({ error: "Kay??t ba?Yar??s??z" });
    }
  });
}

export function login(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "email ve password zorunlu" });
  }

  const sql = `
    SELECT user_id, full_name, email, password_hash, home_address, tax_id
    FROM users
    WHERE email = ?
    LIMIT 1
  `;

  db.query(sql, [email], async (err, rows) => {
    if (err) {
      console.error("Login lookup failed:", err);
      return res.status(500).json({ error: "Giriş sırasında hata oluştu" });
    }
    if (rows.length === 0) {
      const demo = demoUsers[email.toLowerCase()];
      if (demo && password === demo.password) {
        try {
          const created = await upsertDemoUser(email);
          return res.json({
            success: true,
              user: {
                id: created?.id ?? email,
                email,
                name: demo.name,
                address: "",
                taxId: "",
                role: demo.role,
              },
            });
        } catch (createErr) {
          console.error("Demo user create failed:", createErr);
          return res.status(500).json({ error: "Giriş sırasında hata oluştu" });
        }
      }
      return res.status(401).json({ error: "Kullanıcı bulunamadı" });
    }

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password_hash || "");
    if (!match) {
      const demo = demoUsers[email.toLowerCase()];
      if (demo && password === demo.password) {
        return res.json({
          success: true,
          user: { ...normalizeUser(user), role: demo.role ?? "customer" },
        });
      }
      return res.status(401).json({ error: "Incorrect password" });
    }

    return res.json({ success: true, user: normalizeUser(user) });
  });
}

export function forgotPassword(req, res) {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: "Email zorunlu" });
  }

  const sql = `
    SELECT user_id, full_name, email
    FROM users
    WHERE email = ?
    LIMIT 1
  `;

  db.query(sql, [email], (err, rows) => {
    if (err) {
      console.error("Forgot password lookup failed:", err);
      return res.status(500).json({ error: "İşlem sırasında hata oluştu" });
    }
    if (rows.length === 0) {
      return res.status(200).json({ success: true, message: "If the email exists, a reset link was sent." });
    }

    const user = rows[0];
    const rawToken = crypto.randomBytes(20).toString("hex");
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 dk

    const insertSql = `
      INSERT INTO password_resets (user_id, token_hash, expires_at)
      VALUES (?, ?, ?)
    `;

    db.query(insertSql, [user.user_id, tokenHash, expiresAt], (insErr) => {
      if (insErr) {
        console.error("Reset token insert failed:", insErr);
        return res.status(500).json({ error: "Şifre sıfırlama oluşturulamadı" });
      }

      // Build absolute reset URL (prefer env, otherwise infer from request)
      const baseUrl =
        process.env.FRONTEND_BASE_URL ||
        req.get("origin") ||
        (req.get("host") ? `https://${req.get("host")}` : "");
      const resetUrl = `${baseUrl}/reset-password/${rawToken}`;

      // SMTP varsa mail at, yoksa console + response dev token
      const payload = { success: true, message: "Reset link sent" };
      if (process.env.NODE_ENV !== "production") {
        payload.token = rawToken;
        payload.reset_url = resetUrl;
      }

      sendMail({
        to: email,
        subject: "SUHome Password Reset",
        html: `
          <p>Hello ${user.full_name || ""},</p>
          <p>You requested to reset your password. Click the link below to set a new one:</p>
          <p><a href="${resetUrl}">${resetUrl}</a></p>
          <p>This link is valid for 15 minutes. If you didn’t request this, you can ignore this email.</p>
        `,
        text: `Reset your password using this link (valid for 15 minutes): ${resetUrl}`,
      }).catch((mailErr) => {
        console.error("Reset email send failed:", mailErr);
      });

      console.log(`🔐 Password reset token for ${email}: ${rawToken}`);
      return res.json(payload);
    });
  });
}

export function resetPassword(req, res) {
  const { token, password } = req.body;
  if (!token || !password) {
    return res.status(400).json({ error: "token ve password zorunlu" });
  }

  const tokenHash = hashToken(token);
  const sql = `
    SELECT pr.id, pr.user_id, pr.expires_at, u.email
    FROM password_resets pr
    JOIN users u ON u.user_id = pr.user_id
    WHERE pr.token_hash = ?
    ORDER BY pr.created_at DESC
    LIMIT 1
  `;

  db.query(sql, [tokenHash], async (err, rows) => {
    if (err) {
      console.error("Reset token lookup failed:", err);
      return res.status(500).json({ error: "İşlem sırasında hata oluştu" });
    }
    if (rows.length === 0) {
      return res.status(400).json({ error: "Geçersiz veya süresi dolmuş bağlantı" });
    }

    const entry = rows[0];
    if (new Date(entry.expires_at).getTime() < Date.now()) {
      return res.status(400).json({ error: "Geçersiz veya süresi dolmuş bağlantı" });
    }

    try {
      const hashed = await bcrypt.hash(password, 10);
      const updateSql = "UPDATE users SET password_hash = ? WHERE user_id = ?";
      db.query(updateSql, [hashed, entry.user_id], (updErr) => {
        if (updErr) {
          console.error("Password update failed:", updErr);
          return res.status(500).json({ error: "Şifre güncellenemedi" });
        }

        db.query("DELETE FROM password_resets WHERE id = ?", [entry.id], () => {});
        return res.json({ success: true });
      });
    } catch (hashErr) {
      console.error("Password hash failed:", hashErr);
      return res.status(500).json({ error: "Şifre güncellenemedi" });
    }
  });
}
