import nodemailer from "nodemailer";

const {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_SECURE,
  SMTP_USER,
  SMTP_PASS,
  SMTP_FROM,
} = process.env;

let transporter = null;

if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: String(SMTP_SECURE ?? "").toLowerCase() === "true",
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
  transporter.verify((err) => {
    if (err) {
      console.error("SMTP doğrulama hatası:", err);
    } else {
      console.log("📧 SMTP hazır");
    }
  });
} else {
  console.warn("SMTP env değişkenleri tanımlı değil; e-posta gönderimi devre dışı.");
}

export async function sendMail({ to, subject, html, text }) {
  if (!transporter) {
    console.warn("sendMail çağrıldı ama SMTP yok; no-op.");
    return { skipped: true };
  }

  const from = SMTP_FROM || SMTP_USER;
  return transporter.sendMail({
    from,
    to,
    subject,
    text: text || "",
    html: html || text || "",
  });
}
