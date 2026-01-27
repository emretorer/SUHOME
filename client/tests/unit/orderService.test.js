import { formatOrderId, getNextStatus } from "../../src/services/orderService.js";

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

// unit test 1
runTest("formatOrderId pads numeric IDs", () => {
  expectEqual(formatOrderId(42), "#ORD-00042");
});

// unit test 2
runTest("formatOrderId leaves prefixed values intact", () => {
  expectEqual(formatOrderId("#ORD-00999"), "#ORD-00999");
});

// unit test 3
runTest("formatOrderId handles missing values with fallback", () => {
  expectEqual(formatOrderId(null), "#ORD-00000");
});

// unit test 4
runTest("getNextStatus advances from Processing to In-transit", () => {
  const { nextStatus } = getNextStatus({ status: "Processing" });
  expectEqual(nextStatus, "In-transit");
});

// unit test 5
runTest("getNextStatus keeps Delivered at final step", () => {
  const { nextStatus } = getNextStatus({ status: "Delivered" });
  expectEqual(nextStatus, "Delivered");
});
