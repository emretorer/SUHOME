export const SUPPORT_BASE = "/api/support";

async function handleResponse(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data?.error || res.statusText || "Request failed";
    throw new Error(message);
  }
  return data;
}

export async function fetchUserConversation({ userId, orderId, email, name }) {
  const params = new URLSearchParams();
  if (userId) params.set("user_id", userId);
  if (orderId) params.set("order_id", orderId);
  if (email) params.set("email", email);
  if (name) params.set("name", name);
  const res = await fetch(`${SUPPORT_BASE}/conversation?${params.toString()}`);
  return handleResponse(res);
}

export async function sendUserMessage({ userId, text, orderId, email, name, attachments = [] }) {
  const hasFiles = Array.isArray(attachments) && attachments.length > 0;
  const options = { method: "POST" };

  if (hasFiles) {
    const formData = new FormData();
    if (userId) formData.append("user_id", userId);
    if (orderId) formData.append("order_id", orderId);
    if (email) formData.append("email", email);
    if (name) formData.append("name", name);
    formData.append("text", text || "");
    attachments.forEach((file) => formData.append("attachments", file));
    options.body = formData;
  } else {
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify({ user_id: userId, text, order_id: orderId, email, name });
  }

  const res = await fetch(`${SUPPORT_BASE}/message`, options);
  return handleResponse(res);
}

export async function fetchSupportInbox() {
  const res = await fetch(`${SUPPORT_BASE}/inbox`);
  return handleResponse(res);
}

export async function fetchSupportMessages(conversationId) {
  const res = await fetch(`${SUPPORT_BASE}/conversations/${conversationId}/messages`);
  return handleResponse(res);
}

export async function claimSupportConversation(conversationId, agentId) {
  const options = { method: "POST" };
  if (agentId) {
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify({ agent_id: agentId });
  }
  const res = await fetch(`${SUPPORT_BASE}/conversations/${conversationId}/claim`, options);
  return handleResponse(res);
}

export async function unclaimSupportConversation(conversationId, agentId) {
  const options = { method: "POST" };
  if (agentId) {
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify({ agent_id: agentId });
  }
  const res = await fetch(`${SUPPORT_BASE}/conversations/${conversationId}/unclaim`, options);
  return handleResponse(res);
}

export async function fetchCustomerWishlist(userId) {
  const res = await fetch(`${SUPPORT_BASE}/customers/${userId}/wishlist`);
  return handleResponse(res);
}

export async function fetchCustomerProfile(userId) {
  const res = await fetch(`${SUPPORT_BASE}/customers/${userId}/profile`);
  return handleResponse(res);
}

export async function fetchCustomerCart(userId) {
  const res = await fetch(`${SUPPORT_BASE}/customers/${userId}/cart`);
  return handleResponse(res);
}

export async function linkConversationToUser({ conversationId, userId, email, name }) {
  const res = await fetch(`${SUPPORT_BASE}/conversations/${conversationId}/identify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, email, name }),
  });
  return handleResponse(res);
}

export async function sendSupportMessage({ conversationId, agentId, text, attachments = [] }) {
  const hasFiles = Array.isArray(attachments) && attachments.length > 0;
  const options = { method: "POST" };

  if (hasFiles) {
    const formData = new FormData();
    formData.append("text", text || "");
    if (agentId) formData.append("agent_id", agentId);
    attachments.forEach((file) => formData.append("attachments", file));
    options.body = formData;
  } else {
    options.headers = { "Content-Type": "application/json" };
    options.body = JSON.stringify({ agent_id: agentId, text });
  }

  const res = await fetch(`${SUPPORT_BASE}/conversations/${conversationId}/reply`, options);
  return handleResponse(res);
}

export async function deleteConversation(conversationId) {
  const res = await fetch(`${SUPPORT_BASE}/conversations/${conversationId}`, {
    method: "DELETE",
  });
  return handleResponse(res);
}
