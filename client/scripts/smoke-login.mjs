const targetUrl = process.env.ZARKA_CLIENT_URL || "http://localhost:5173";

const response = await fetch(targetUrl, { method: "GET" });
if (!response.ok) {
  throw new Error(`Failed to fetch ${targetUrl}: ${response.status}`);
}
const html = await response.text();
const requiredText = ["Login", "Guest", "Email", "Facebook"];
const missing = requiredText.filter((text) => !html.includes(text));
if (missing.length > 0) {
  throw new Error(`Missing login markers: ${missing.join(", ")}`);
}
console.log("Login smoke test passed.");
