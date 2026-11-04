import test from "node:test";
import assert from "node:assert/strict";
import { generateGuestDisplayName } from "@shared";
import { ensureGuestDisplayName } from "../src/services/nakama";
import type { Client, Session } from "@heroiclabs/nakama-js";

test("generateGuestDisplayName produces valid Player_<4-digit number>", () => {
  const name1 = generateGuestDisplayName(() => 0);
  assert.equal(name1, "Player_1000");

  const name2 = generateGuestDisplayName(() => 0.42);
  assert.equal(name2, "Player_4780");

  const name3 = generateGuestDisplayName(() => 0.99999);
  assert.equal(name3, "Player_9999");

  for (let i = 0; i < 20; i++) {
    const randomName = generateGuestDisplayName();
    assert.match(randomName, /^Player_\d{4}$/);
    const num = parseInt(randomName.replace("Player_", ""), 10);
    assert.ok(num >= 1000 && num <= 9999);
  }
});

test("ensureGuestDisplayName assigns Player_<random4> to guest account without display name", async () => {
  let updatedPayload: { display_name?: string } | null = null;

  const mockClient = {
    getAccount: async () => ({
      user: { id: "user-1", display_name: "" },
      email: ""
    }),
    updateAccount: async (_session: unknown, payload: { display_name?: string }) => {
      updatedPayload = payload;
    }
  } as unknown as Client;

  const mockSession = {} as Session;

  await ensureGuestDisplayName(mockClient, mockSession);

  assert.ok(updatedPayload);
  assert.match(updatedPayload.display_name ?? "", /^Player_\d{4}$/);
});

test("ensureGuestDisplayName leaves existing display name untouched", async () => {
  let updateCalled = false;

  const mockClient = {
    getAccount: async () => ({
      user: { id: "user-1", display_name: "Alice" },
      email: ""
    }),
    updateAccount: async () => {
      updateCalled = true;
    }
  } as unknown as Client;

  const mockSession = {} as Session;

  await ensureGuestDisplayName(mockClient, mockSession);

  assert.equal(updateCalled, false);
});

test("ensureGuestDisplayName does not modify email accounts", async () => {
  let updateCalled = false;

  const mockClient = {
    getAccount: async () => ({
      user: { id: "user-1", display_name: "" },
      email: "guest@example.com"
    }),
    updateAccount: async () => {
      updateCalled = true;
    }
  } as unknown as Client;

  const mockSession = {} as Session;

  await ensureGuestDisplayName(mockClient, mockSession);

  assert.equal(updateCalled, false);
});
