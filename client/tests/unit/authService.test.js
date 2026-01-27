// Async test harness
async function runTest(name, fn) {
  try {
    await fn();
    console.log(`✅ ${name}`);
  } catch (error) {
    console.error(`❌ ${name} -> ${error.message}`);
  }
}

function expectEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected} but received ${actual}`);
  }
}

function expectDeepEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) {
    throw new Error(message || `Expected ${b} but received ${a}`);
  }
}

function setFetchMock(fn) {
  global.fetch = fn;
}

const { loginUser, registerUser } = await import("../../src/services/authService.js");

// unit test 22
runTest("loginUser falls back to demo user on 401", async () => {
  setFetchMock(async () => ({
    ok: false,
    json: async () => ({ error: "Invalid login" }),
  }));

  const result = await loginUser({ email: "demo@suhome.com", password: "demo" });
  expectEqual(result.user.email, "demo@suhome.com");
  expectEqual(result.user.role, "customer");
});

// unit test 23
runTest("loginUser falls back to demo user on network error", async () => {
  setFetchMock(async () => {
    throw new Error("Network down");
  });

  const result = await loginUser({ email: "demo@suhome.com", password: "demo" });
  expectEqual(result.user.name, "Demo User");
});

// unit test 24
runTest("loginUser surfaces server error for non-demo user", async () => {
  setFetchMock(async () => ({
    ok: false,
    json: async () => ({ error: "Wrong credentials" }),
  }));

  let caught;
  try {
    await loginUser({ email: "user@test.com", password: "bad" });
  } catch (error) {
    caught = error;
  }

  expectEqual(Boolean(caught), true);
  expectEqual(caught.message, "Wrong credentials");
});

// unit test 25
runTest("registerUser posts body and returns payload", async () => {
  setFetchMock(async (url, options) => ({
    ok: true,
    json: async () => ({ url, method: options.method, body: JSON.parse(options.body) }),
  }));

  const payload = {
    fullName: "Jane Doe",
    email: "jane@example.com",
    password: "secret",
    taxId: "123",
  };

  const result = await registerUser(payload);
  expectEqual(result.method, "POST");
  expectEqual(result.url, "/api/auth/register");
  expectDeepEqual(result.body, payload);
});
