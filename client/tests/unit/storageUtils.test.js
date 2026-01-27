const mockStorage = (() => {
  let store = {};
  return {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, value) => {
      store[key] = String(value);
    },
    removeItem: (key) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

global.window = { localStorage: mockStorage };

const {
  getJSON,
  setJSON,
  removeItem,
  buildStorageKey,
  updateJSON,
} = await import("../../src/utils/storage.js");

function runTest(name, fn) {
  try {
    fn();
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

function resetStorage() {
  mockStorage.clear();
}

// unit test 11
runTest("getJSON returns parsed value when present", () => {
  resetStorage();
  mockStorage.setItem("foo", JSON.stringify({ a: 1 }));
  expectDeepEqual(getJSON("foo"), { a: 1 });
});

// unit test 12
runTest("getJSON returns fallback when key missing", () => {
  resetStorage();
  const fallback = { empty: true };
  expectDeepEqual(getJSON("missing", fallback), fallback);
});

// unit test 13
runTest("setJSON writes value as string", () => {
  resetStorage();
  const payload = { hello: "world" };
  const result = setJSON("bar", payload);
  expectEqual(result, true);
  expectEqual(mockStorage.getItem("bar"), JSON.stringify(payload));
});

// unit test 14
runTest("removeItem clears stored entry", () => {
  resetStorage();
  setJSON("temp", { keep: false });
  removeItem("temp");
  expectEqual(mockStorage.getItem("temp"), null);
});

// unit test 15
runTest("buildStorageKey builds scoped keys", () => {
  expectEqual(buildStorageKey("base", null), "base");
  expectEqual(buildStorageKey("base", { id: 7 }), "base:7");
  expectEqual(buildStorageKey("base", { email: "user@example.com" }), "base:user@example.com");
  expectEqual(buildStorageKey("base", "guest123"), "base:guest123");
});

// unit test 16
runTest("updateJSON applies atomic change", () => {
  resetStorage();
  setJSON("counter", { value: 1 });
  const next = updateJSON("counter", (current) => ({ value: current.value + 4 }));
  expectDeepEqual(next, { value: 5 });
  expectDeepEqual(getJSON("counter"), { value: 5 });
});
