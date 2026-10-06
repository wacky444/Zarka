import assert from "node:assert/strict";
import { test } from "node:test";
import {
  adjacentDestinationToward,
  areSameLocation,
  findTileAtCoord,
  parseAxial,
} from "../src/utils/location";

test("adjacentDestinationToward selects the closest walkable tile toward the requested location", () => {
  const origin = { q: 0, r: 0 };
  const tiles = [
    { id: "blocked-east", coord: { q: 1, r: 0 }, walkable: false },
    { id: "not-adjacent", coord: { q: 1, r: -1 }, walkable: true },
    { id: "north", coord: { q: 0, r: -1 }, walkable: true },
    { id: "east-two", coord: { q: 2, r: 0 }, walkable: true },
  ].map((tile) => ({
    ...tile,
    localizationType: "Road" as const,
    itemIds: [],
  }));

  assert.deepEqual(
    adjacentDestinationToward(tiles, origin, { q: 2, r: 0 }),
    { tileId: "north", coord: { q: 0, r: -1 } },
  );
  assert.equal(adjacentDestinationToward(tiles, origin, origin), undefined);
});

test("location helpers compare axial coordinates and find matching tiles", () => {
  const coord = { q: 2, r: -1 };
  const tiles = [
    {
      id: "target",
      coord,
      localizationType: "Road" as const,
      walkable: true,
      itemIds: [],
    },
  ];

  assert.equal(areSameLocation(coord, { q: 2, r: -1 }), true);
  assert.equal(areSameLocation(coord, { q: 1, r: -1 }), false);
  assert.equal(areSameLocation(coord, undefined), false);
  assert.equal(findTileAtCoord(tiles, { q: 2, r: -1 })?.id, "target");
  assert.equal(findTileAtCoord(tiles, { q: 2, r: 0 }), undefined);
  assert.equal(findTileAtCoord(tiles, undefined), undefined);
});

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
