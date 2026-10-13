import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

test("login page contains required bootstrap markers", () => {
  const requiredText = [
    'id="game"',
    'type="module" src="/src/main.ts"',
    "facebook-jssdk"
  ];
  const missing = requiredText.filter((text) => !html.includes(text));
  assert.deepEqual(missing, []);
});
