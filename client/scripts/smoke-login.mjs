import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
// Phaser renders login UI in canvas after boot, so smoke-test static bootstrap markers.
const requiredText = [
  'id="game"',
  'type="module" src="/src/main.ts"',
  "facebook-jssdk",
];
const missing = requiredText.filter((text) => !html.includes(text));
if (missing.length > 0) {
  throw new Error(`Missing bootstrap markers: ${missing.join(", ")}`);
}
console.log("Login smoke test passed.");