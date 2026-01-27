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

// Set up environment for storage helpers.
global.window = { localStorage: mockStorage };

const {
  getInventoryAdjustments,
  decreaseInventory,
  setInventoryAdjustmentsFromCart,
  getReviewMap,
  addReview,
  approveReview,
} = await import("../../src/services/localStorageHelpers.js");

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

// unit test 6
runTest("getInventoryAdjustments returns empty object by default", () => {
  resetStorage();
  expectDeepEqual(getInventoryAdjustments(), {});
});

// unit test 7
runTest("decreaseInventory accumulates quantities by id", () => {
  resetStorage();
  decreaseInventory([
    { id: "p1", quantity: 2 },
    { productId: "p1" }, // defaults to +1
    { id: "p2", quantity: 3 },
  ]);

  const map = getInventoryAdjustments();
  expectEqual(map.p1, 3);
  expectEqual(map.p2, 3);
});

// unit test 8
runTest("setInventoryAdjustmentsFromCart ignores invalid entries", () => {
  resetStorage();
  setInventoryAdjustmentsFromCart([
    { productId: "x1", quantity: 2 },
    { id: "x2", qty: "4" },
    { id: "bad", quantity: "nope" },
    { id: "neg", qty: -3 },
  ]);

  const map = getInventoryAdjustments();
  expectEqual(map.x1, 2);
  expectEqual(map.x2, 4);
  expectEqual(map.bad, undefined);
  expectEqual(map.neg, undefined);
});

// unit test 9
runTest("addReview stores pending review per product", () => {
  resetStorage();
  const list = addReview("product-77", 4, "Solid choice", "Tester");

  const map = getReviewMap();
  expectEqual(Array.isArray(map["product-77"]), true);
  expectEqual(map["product-77"].length, 1);
  const review = map["product-77"][0];
  expectEqual(list[0].id, review.id);
  expectEqual(review.approved, false);
  expectEqual(review.displayName, "Tester");
  expectEqual(review.rating, 4);
  expectEqual(typeof review.date, "string");
});

// unit test 10
runTest("approveReview toggles only the targeted review", () => {
  resetStorage();
  const firstList = addReview("prod-1", 3, "Okay", "Alice");
  const firstId = firstList[0].id;
  const secondList = addReview("prod-1", 5, "Great", "Bob");
  const secondId = secondList[1].id;

  const updated = approveReview("prod-1", secondId, true);
  const [first, second] = updated["prod-1"];
  expectEqual(first.id, firstId);
  expectEqual(first.approved, false);
  expectEqual(second.id, secondId);
  expectEqual(second.approved, true);
});
