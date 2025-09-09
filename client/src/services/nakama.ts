import { Client, Session } from "@heroiclabs/nakama-js";

export async function healthProbe(
  host: string,
  port: number,
  useSSL: boolean
): Promise<void> {
  const scheme = useSSL ? "https" : "http";
  const url = `${scheme}://${host}:${port}/healthcheck`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  const res = await fetch(url, { method: "GET", signal: controller.signal });
  clearTimeout(timeout);
  if (!res.ok) {
    throw new Error("Health check HTTP " + res.status);
  }
}

export function getEnv() {
  const host = import.meta.env.VITE_NAKAMA_HOST || "127.0.0.1";
  const port = String(parseInt(import.meta.env.VITE_NAKAMA_PORT || "7350", 10));
  const useSSL = (import.meta.env.VITE_NAKAMA_SSL || "false") === "true";
  const serverKey = import.meta.env.VITE_NAKAMA_SERVER_KEY || "defaultkey";
  return { host, port, useSSL, serverKey };
}

export function getOrCreateDeviceId(): string {
  const key = "device_id";
  let existing = localStorage.getItem(key);
  if (!existing) {
    existing = crypto.randomUUID();
    localStorage.setItem(key, existing);
  }
  return existing;
}

export async function initNakama(): Promise<{
  client: Client;
  session: Session;
}> {
  const { host, port, useSSL, serverKey } = getEnv();
  const client = new Client(serverKey, host, port, useSSL);
  await healthProbe(host, parseInt(port, 10), useSSL);
  const deviceId = getOrCreateDeviceId();
  const session = await client.authenticateDevice(deviceId, true);
  return { client, session };
}
