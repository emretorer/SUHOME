import { getJSON, setJSON } from "../utils/storage.js";

const INVENTORY_KEY = "inventory-adjustments";
const REVIEW_KEY = "reviews";

export function getInventoryAdjustments() {
  return getJSON(INVENTORY_KEY, {});
}

export function decreaseInventory(items) {
  if (!Array.isArray(items)) return;

  const adjustments = getInventoryAdjustments();

  items.forEach((item) => {
    const id = item.id ?? item.productId;
    const qty = Number(item.quantity ?? 1);
    if (!id || Number.isNaN(qty)) return;
    adjustments[id] = (adjustments[id] ?? 0) + qty;
  });

  setJSON(INVENTORY_KEY, adjustments);
}

export function setInventoryAdjustmentsFromCart(items) {
  if (!Array.isArray(items)) return;
  const adjustments = {};
  items.forEach((item) => {
    const id = item.id ?? item.productId;
    const qty = Number(item.quantity ?? item.qty ?? 0);
    if (!id || Number.isNaN(qty) || qty <= 0) return;
    adjustments[id] = qty;
  });
  setJSON(INVENTORY_KEY, adjustments);
}

export function getReviewMap() {
  return getJSON(REVIEW_KEY, {});
}

export function addReview(productId, rating, comment, displayName) {
  const reviewMap = getJSON(REVIEW_KEY, {});
  const id =
    (typeof crypto !== "undefined" && crypto.randomUUID?.()) ||
    `rev-${Date.now()}-${Math.round(Math.random() * 1000)}`;

  const newReview = {
    id,
    productId,
    rating,
    comment,
    displayName,
    date: new Date().toISOString(),
    approved: false,
  };

  const list = reviewMap[productId] ?? [];
  list.push(newReview);
  reviewMap[productId] = list;

  setJSON(REVIEW_KEY, reviewMap);
  return list;
}

export function approveReview(productId, reviewId, approved = true) {
  const reviewMap = getJSON(REVIEW_KEY, {});
  const list = reviewMap[productId];
  if (!Array.isArray(list)) return reviewMap;

  reviewMap[productId] = list.map((item) =>
    String(item.id ?? "") === String(reviewId) ? { ...item, approved } : item
  );

  setJSON(REVIEW_KEY, reviewMap);
  return reviewMap;
}
