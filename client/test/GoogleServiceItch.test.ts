import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isItchIo } from "../src/services/googleService";

describe("isItchIo detection", () => {
  it("detects itch.zone hostnames", () => {
    const originalWindow = globalThis.window;
    try {
      (globalThis as any).window = {
        location: {
          hostname: "html-classic.itch.zone"
        }
      };
      assert.equal(isItchIo(), true);
    } finally {
      (globalThis as any).window = originalWindow;
    }
  });

  it("detects itch.io hostnames", () => {
    const originalWindow = globalThis.window;
    try {
      (globalThis as any).window = {
        location: {
          hostname: "wacky.itch.io"
        }
      };
      assert.equal(isItchIo(), true);
    } finally {
      (globalThis as any).window = originalWindow;
    }
  });

  it("returns false for non-itch hostnames", () => {
    const originalWindow = globalThis.window;
    try {
      (globalThis as any).window = {
        location: {
          hostname: "wacky444.github.io"
        }
      };
      assert.equal(isItchIo(), false);
    } finally {
      (globalThis as any).window = originalWindow;
    }
  });
});
