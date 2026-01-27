const API_BASE =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE_URL) || "";

export async function fetchProductComments(productId, { userId, signal } = {}) {
  if (!productId) return [];
  const userQuery = userId ? `?userId=${encodeURIComponent(userId)}` : "";
  const res = await fetch(`${API_BASE}/api/comments/${productId}${userQuery}`, { signal });
  const data = await res.json().catch(() => []);
  if (!res.ok) {
    console.error("Failed to load comments", data);
    return [];
  }
  return Array.isArray(data) ? data : [];
}

export async function addComment({ userId, productId, rating, text }) {
  const res = await fetch(`${API_BASE}/api/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: userId,
      productId,
      rating,
      text,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data?.message || "Comment could not be saved";
    throw new Error(message);
  }
  return data;
}

export async function hasDelivered(userId, productId, signal) {
  if (!userId || !productId) return { delivered: false };
  const res = await fetch(
    `${API_BASE}/api/comments/can/${productId}?userId=${encodeURIComponent(userId)}`,
    { signal }
  );
  const data = await res.json().catch(() => ({ canReview: false }));
  return { delivered: !!data.canReview };
}

export async function fetchUserComments(userId, signal) {
  if (!userId) return [];
  const res = await fetch(`${API_BASE}/api/comments/user?userId=${encodeURIComponent(userId)}`, {
    signal,
  });
  const data = await res.json().catch(() => []);
  if (!res.ok) {
    console.error("Failed to load user comments", data);
    return [];
  }
  return Array.isArray(data) ? data : [];
}

export async function fetchPendingComments(signal) {
  const res = await fetch(`${API_BASE}/api/comments/pending`, { signal });
  const data = await res.json().catch(() => []);
  if (!res.ok) {
    console.error("Failed to load pending comments", data);
    throw new Error("Pending comments fetch failed");
  }
  return Array.isArray(data) ? data : [];
}

export async function approveComment(commentId) {
  const res = await fetch(`${API_BASE}/api/comments/${commentId}/approve`, { method: "POST" });
  if (!res.ok) throw new Error("Approve failed");
  return res.json();
}

export async function rejectComment(commentId) {
  const res = await fetch(`${API_BASE}/api/comments/${commentId}/reject`, { method: "POST" });
  if (!res.ok) throw new Error("Reject failed");
  return res.json();
}
