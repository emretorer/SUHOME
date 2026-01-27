// Minimal async test harness
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

// Mock fetch helper that can be swapped per test.
function setFetchMock(factory) {
  global.fetch = factory;
}

const { updateUserAddress, updateUserProfile } = await import(
  "../../src/services/userService.js"
);

// unit test 17
runTest("updateUserAddress rejects non-numeric ids", async () => {
  let caught;
  try {
    await updateUserAddress({ userId: "abc", address: "Main" });
  } catch (error) {
    caught = error;
  }
  expectEqual(Boolean(caught), true);
  expectEqual(caught.message, "Invalid user id");
});

// unit test 18
runTest("updateUserProfile rejects missing id", async () => {
  let caught;
  try {
    await updateUserProfile({ userId: null, name: "Jane", address: "Oak", taxId: "123" });
  } catch (error) {
    caught = error;
  }
  expectEqual(Boolean(caught), true);
  expectEqual(caught.message, "Invalid user id");
});

// unit test 19
runTest("updateUserAddress calls PATCH with encoded id and returns payload", async () => {
  setFetchMock(async (url, options) => {
    return {
      ok: true,
      json: async () => ({ url, options }),
    };
  });

  const result = await updateUserAddress({ userId: 42, address: "Baker St" });
  expectEqual(result.url.endsWith("/api/users/42/address"), true);
  expectEqual(result.options.method, "PATCH");
  expectEqual(result.options.headers["Content-Type"], "application/json");
  expectEqual(JSON.parse(result.options.body).address, "Baker St");
});

// unit test 20
runTest("updateUserProfile sends name, address, and taxId", async () => {
  setFetchMock(async (url, options) => ({
    ok: true,
    json: async () => ({ url, body: JSON.parse(options.body), method: options.method }),
  }));

  const result = await updateUserProfile({
    userId: "15",
    name: "John Doe",
    address: "Elm",
    taxId: "T-123",
  });

  expectEqual(result.method, "PATCH");
  expectEqual(result.url.endsWith("/api/users/15/profile"), true);
  expectDeepEqual(result.body, { name: "John Doe", address: "Elm", taxId: "T-123" });
});

// unit test 21
runTest("updateUserAddress surfaces server error message", async () => {
  setFetchMock(async () => ({
    ok: false,
    json: async () => ({ error: "Address update failed" }),
  }));

  let caught;
  try {
    await updateUserAddress({ userId: 5, address: "Fail Rd" });
  } catch (error) {
    caught = error;
  }

  expectEqual(Boolean(caught), true);
  expectEqual(caught.message, "Address update failed");
});
