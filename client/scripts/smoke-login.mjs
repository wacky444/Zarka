const targetUrl = process.env.ZARKA_CLIENT_URL || "http://localhost:5173";

const response = await fetch(targetUrl, { method: "GET" });
if (!response.ok) {
  throw new Error(`Failed to fetch ${targetUrl}: ${response.status}`);
}
const html = await response.text();
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
