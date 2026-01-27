async function handle(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "Request failed");
  }
  return data;
}

const DEMO_USERS = [
  {
    id: 101,
    email: "demo@suhome.com",
    name: "Demo User",
    address: "Demo Address",
    role: "customer",
  },
];

function tryDemoLogin(email, password) {
  if (!email || !password) return null;
  if (email.toLowerCase() === "demo@suhome.com" && password === "demo") {
    return DEMO_USERS[0];
  }
  return null;
}

export async function registerUser({ fullName, email, password, taxId }) {
  const res = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fullName, email, password, taxId }),
  });
  return handle(res);
}

export async function loginUser({ email, password }) {
  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (res.ok) return handle(res);

    const demo = tryDemoLogin(email, password);
    if (demo) return { user: demo };

    return handle(res);
  } catch (error) {
    const demo = tryDemoLogin(email, password);
    if (demo) return { user: demo };
    throw error;
  }
}

export async function requestPasswordReset(email) {
  const res = await fetch("/api/auth/forgot", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  return handle(res);
}

export async function submitPasswordReset({ token, password }) {
  const res = await fetch("/api/auth/reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, password }),
  });
  return handle(res);
}
