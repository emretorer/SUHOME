import db from "../db.js";
import PDFDocument from "pdfkit";
import nodemailer from "nodemailer";

// Türkçe karakter düzeltme
function normalizeTR(text) {
  if (!text) return "";
  return text
    .replace(/ğ/g, "g").replace(/Ğ/g, "G")
    .replace(/ş/g, "s").replace(/Ş/g, "S")
    .replace(/ü/g, "u").replace(/Ü/g, "U")
    .replace(/ö/g, "o").replace(/Ö/g, "O")
    .replace(/ç/g, "c").replace(/Ç/g, "C")
    .replace(/ı/g, "i").replace(/İ/g, "I");
}

function parseAddressPayload(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" ? parsed : null;
  } catch (error) {
    return null;
  }
}

export function generateInvoice(req, res) {
  let { order_id } = req.params;

  // ⭐ ORD-00047 → 47
  // ⭐ %23ORD-00047 → 47
  // ⭐ #ORD-00047 → 47
  // ⭐ 47 → 47
  const digits = String(order_id).match(/\d+/);
  const realOrderId = digits ? Number(digits[0]) : null;

  if (!realOrderId) {
    return res.status(400).json({ error: "Invalid order ID format" });
  }

  const sqlOrder = `
    SELECT 
      o.order_id,
      o.user_id,
      o.order_date,
      o.total_amount,
      o.shipping_address,
      o.billing_address,
      u.full_name AS customer_name,
      u.email AS customer_email,
      u.home_address AS customer_address,
      u.tax_id AS customer_tax_id
    FROM orders o
    LEFT JOIN users u ON u.user_id = o.user_id
    WHERE o.order_id = ?
    LIMIT 1
  `;

  db.query(sqlOrder, [realOrderId], (err, orderRows) => {
    if (err || !orderRows.length) {
      return res.status(404).json({ error: "Order not found" });
    }

    const order = orderRows[0];

    const sqlItems = `
      SELECT 
        oi.order_item_id,
        oi.order_id,
        oi.product_id,
        oi.quantity,
        oi.unit_price,
        COALESCE(p.product_name, CONCAT('Product #', oi.product_id)) AS product_name,
        p.product_price
      FROM order_items oi
      LEFT JOIN products p ON p.product_id = oi.product_id
      WHERE oi.order_id = ?
    `;

    db.query(sqlItems, [realOrderId], (err, items) => {
      if (err) {
        console.error("Invoice items query failed:", err);
        return res.status(500).json({ error: "Order items could not be loaded" });
      }

      const safeItems =
        items.length > 0
          ? items
          : [
              {
                order_item_id: `fallback-${realOrderId}`,
                order_id: realOrderId,
                product_id: null,
                quantity: 1,
                unit_price: Number(order.total_amount ?? 0),
                product_name: "Order summary",
              },
            ];

      const shippingDetails = parseAddressPayload(order.shipping_address);
      const billingDetails = parseAddressPayload(order.billing_address);

      return createPdf(order, safeItems, res, {
        shippingDetails,
        billingDetails,
      });
    });
  });
}

function formatAddressLines(details) {
  if (!details) return [];
  const lines = [];
  if (details.address) lines.push(details.address);
  const cityLine = [details.city, details.postalCode].filter(Boolean).join(" ").trim();
  if (cityLine) lines.push(cityLine);
  return lines;
}

function renderInvoice(doc, order, items, detailPayload = {}) {
  const blue = "#0058a3";
  const greyLight = "#f2f4f7";
  const greyBorder = "#d0d7de";

  // ============================
  // HEADER
  // ============================
  doc.font("Helvetica-Bold").fontSize(22).fillColor(blue).text("SUHOME", 50, 40);

  doc
    .font("Helvetica")
    .fontSize(11)
    .fillColor("black")
    .text("Bagdat Street No:25", 50, 75)
    .text("Kadikoy / Istanbul", 50, 90)
    .text("Phone: +90 (216) 123 45 67", 50, 105)
    .text("Email: support@suhome.com", 50, 120);

  // INVOICE TITLE
  doc.font("Helvetica-Bold").fontSize(28).fillColor(blue).text("INVOICE", 350, 40);

  const invoiceDate = new Date(order.order_date).toLocaleDateString("tr-TR");
  const formattedInvoiceId = `ORD-${String(order.order_id).padStart(5, "0")}`;

  doc
    .font("Helvetica")
    .fontSize(12)
    .fillColor("black")
    .text(`DATE: ${invoiceDate}`, 350, 95)
    .text(`INVOICE #: ${formattedInvoiceId}`, 350, 115);

  // ============================
  // BILL TO
  // ============================
  let y = 180;

  doc.rect(50, y, 500, 25).fill(blue);
  doc.fillColor("white").font("Helvetica-Bold").text("BILL TO", 55, y + 7);

  y += 40;

  const { shippingDetails, billingDetails } = detailPayload;
  const email = normalizeTR(
    (shippingDetails?.email || order.customer_email || "customer@suhome.com")
  );
  const customerName = normalizeTR(
    (
      [shippingDetails?.firstName, shippingDetails?.lastName].filter(Boolean).join(" ") ||
      order.customer_name ||
      "SUHome Customer"
    ).trim()
  );
  const addressLines =
    formatAddressLines(shippingDetails) ||
    formatAddressLines(billingDetails) ||
    [order.shipping_address || order.billing_address || "Address not provided"];
  const noteLine = shippingDetails?.notes?.trim();
  const phoneLine = shippingDetails?.phone?.trim();

  const sections = [
    { label: "Full Name", value: customerName },
    { label: "Email", value: email },
    order.customer_tax_id ? { label: "Tax ID", value: normalizeTR(order.customer_tax_id) } : null,
    {
      label: "Address",
      value: addressLines.map((line) => normalizeTR(line)).join("\n"),
    },
    phoneLine ? { label: "Phone", value: normalizeTR(phoneLine) } : null,
    noteLine ? { label: "Note", value: normalizeTR(noteLine) } : null,
  ].filter(Boolean);

  let textY = y;
  sections.forEach((section) => {
    doc
      .fillColor("#0f172a")
      .font("Helvetica-Bold")
      .fontSize(12)
      .text(`${section.label}:`, 50, textY);
    textY += 15;
    doc
      .fillColor("black")
      .font("Helvetica")
      .fontSize(12)
      .text(section.value || "-", 50, textY);
    textY += section.value?.split("\n").length * 15 || 15;
    textY += 5;
  });

  // ============================
  // PRODUCT TABLE HEADER
  // ============================
  const tableHeaderY = textY + 40;
  doc.rect(50, tableHeaderY, 500, 25).fill(blue);
  doc
    .fillColor("white")
    .font("Helvetica-Bold")
    .text("DESCRIPTION", 55, tableHeaderY + 7)
    .text("QTY", 300, tableHeaderY + 7)
    .text("UNIT PRICE", 360, tableHeaderY + 7)
    .text("AMOUNT", 450, tableHeaderY + 7);

  let rowY = tableHeaderY + 30;

  doc.lineWidth(0.8).strokeColor(greyBorder);

  items.forEach((i) => {
    const baseUnit = Number(i.product_price ?? i.unit_price ?? 0);
    const discountedUnit = Number(i.unit_price ?? 0);
    const amount = Number(i.quantity) * discountedUnit;

    doc.rect(50, rowY - 2, 500, 28).fill(greyLight).stroke();

    doc
      .fillColor("black")
      .font("Helvetica")
      .fontSize(12)
      .text(normalizeTR(i.product_name), 55, rowY + 5)
      .text(i.quantity, 300, rowY + 5)
      .text(`${baseUnit.toLocaleString("tr-TR")} TL`, 360, rowY + 5)
      .text(`${amount.toLocaleString("tr-TR")} TL`, 450, rowY + 5);

    rowY += 30;
  });

  // ============================
  // TOTAL
  // ============================
  const totalY = rowY + 24;
  const originalSubtotal = items.reduce((sum, item) => {
    const baseUnit = Number(item.product_price ?? item.unit_price ?? 0);
    return sum + baseUnit * Number(item.quantity);
  }, 0);
  const discountedSubtotal = items.reduce(
    (sum, item) => sum + Number(item.unit_price) * Number(item.quantity),
    0
  );
  const discountAmount = Math.max(originalSubtotal - discountedSubtotal, 0);
  const totalAmount = Number(order.total_amount ?? discountedSubtotal);
  const shippingFee = Math.max(totalAmount - discountedSubtotal, 0);

  doc
    .fillColor("black")
    .font("Helvetica-Bold")
    .fontSize(12)
    .text("SUBTOTAL:", 360, totalY)
    .text(`${originalSubtotal.toLocaleString("tr-TR")} TL`, 450, totalY);

  const discountDisplay =
    discountAmount > 0 ? `-${discountAmount.toLocaleString("tr-TR")} TL` : "0 TL";

  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .text("DISCOUNT:", 360, totalY + 18)
    .text(discountDisplay, 450, totalY + 18);

  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .text("SHIPPING:", 360, totalY + 36)
    .text(`${shippingFee.toLocaleString("tr-TR")} TL`, 450, totalY + 36);

  doc
    .font("Helvetica-Bold")
    .fontSize(16)
    .fillColor(blue)
    .text("TOTAL:", 360, totalY + 60);

  doc
    .fillColor("black")
    .font("Helvetica-Bold")
    .text(`${totalAmount.toLocaleString("tr-TR")} TL`, 450, totalY + 60);

  // ============================
  // FOOTER
  // ============================
  doc
    .font("Helvetica")
    .fontSize(12)
    .text("Thank you for choosing SUHOME.", 0, totalY + 100, { align: "center" });
}

function createPdf(order, items, res, detailPayload = {}) {
  const doc = new PDFDocument({ margin: 40 });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `inline; filename=invoice_${order.order_id}.pdf`
  );

  doc.pipe(res);
  renderInvoice(doc, order, items, detailPayload);
  doc.end();
}

function createPdfBuffer(order, items, detailPayload = {}) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40 });
      const chunks = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", (err) => reject(err));

      renderInvoice(doc, order, items, detailPayload);
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

async function sendInvoiceEmail(order, items, detailPayload = {}) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    console.warn("SMTP config missing; skipping invoice email.");
    return;
  }

  const recipient = detailPayload?.shippingDetails?.email || detailPayload?.billingDetails?.email || order.customer_email;
  if (!recipient) {
    console.warn("No recipient email found; skipping invoice email.");
    return;
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  const pdfBuffer = await createPdfBuffer(order, items, detailPayload);
  const formattedInvoiceId = `ORD-${String(order.order_id).padStart(5, "0")}`;

  await transporter.sendMail({
    from: SMTP_FROM || SMTP_USER,
    to: recipient,
    subject: `Your SUHOME invoice ${formattedInvoiceId}`,
    text: `Hello ${order.customer_name || "Customer"},\n\nAttached is your invoice ${formattedInvoiceId}.\n\nThank you for choosing SUHOME.`,
    attachments: [
      {
        filename: `invoice_${formattedInvoiceId}.pdf`,
        content: pdfBuffer,
      },
    ],
  });
}

export async function sendInvoiceEmailForOrder(orderId) {
  const sqlOrder = `
    SELECT 
      o.order_id,
      o.user_id,
      o.order_date,
      o.total_amount,
      o.shipping_address,
      o.billing_address,
      u.full_name AS customer_name,
      u.email AS customer_email,
      u.home_address AS customer_address,
      u.tax_id AS customer_tax_id
    FROM orders o
    LEFT JOIN users u ON u.user_id = o.user_id
    WHERE o.order_id = ?
    LIMIT 1
  `;

  const sqlItems = `
    SELECT 
      oi.order_item_id,
      oi.order_id,
      oi.product_id,
      oi.quantity,
      oi.unit_price,
      COALESCE(p.product_name, CONCAT('Product #', oi.product_id)) AS product_name,
      p.product_price
    FROM order_items oi
    LEFT JOIN products p ON p.product_id = oi.product_id
    WHERE oi.order_id = ?
  `;

  return new Promise((resolve) => {
    db.query(sqlOrder, [orderId], (orderErr, orderRows) => {
      if (orderErr || !orderRows.length) return resolve();
      const order = orderRows[0];
      db.query(sqlItems, [orderId], async (itemErr, items = []) => {
        if (itemErr) items = [];

        const shippingDetails = parseAddressPayload(order.shipping_address);
        const billingDetails = parseAddressPayload(order.billing_address);

        try {
          await sendInvoiceEmail(order, items, { shippingDetails, billingDetails });
        } catch (error) {
          console.error("Invoice email failed:", error);
        }
        resolve();
      });
    });
  });
}
