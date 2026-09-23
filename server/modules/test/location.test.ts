import assert from "node:assert/strict";
import { test } from "node:test";
import { parseAxial } from "../src/utils/location";

test("parseAxial accepts only finite numeric coordinates by default", () => {
  assert.deepEqual(parseAxial({ q: 2, r: -3 }), { q: 2, r: -3 });
  assert.equal(parseAxial({ q: "2", r: "-3" }), null);
  assert.equal(parseAxial({ q: Number.POSITIVE_INFINITY, r: 0 }), null);
  assert.equal(parseAxial(null), null);
});

test("parseAxial can coerce numeric coordinates for action submissions", () => {
  assert.deepEqual(
    parseAxial(
      { q: "2", r: "-3" },
      { coerceNumericCoordinates: true }
    ),
    { q: 2, r: -3 }
  );
  assert.equal(
    parseAxial(
      { q: "invalid", r: 0 },
      { coerceNumericCoordinates: true }
    ),
    null
  );
});
