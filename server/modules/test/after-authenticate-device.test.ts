import test from "node:test";
import assert from "node:assert/strict";
import { afterAuthenticateDevice } from "../src/hooks/afterAuthenticateDevice";
import { generateGuestDisplayName } from "@shared";

test("generateGuestDisplayName produces Player_<4-digit number>", () => {
  const name1 = generateGuestDisplayName(() => 0);
  assert.equal(name1, "Player_1000");

  const name2 = generateGuestDisplayName(() => 0.5);
  assert.equal(name2, "Player_5500");

  const name3 = generateGuestDisplayName(() => 0.99999);
  assert.equal(name3, "Player_9999");

  const defaultRandom = generateGuestDisplayName();
  assert.match(defaultRandom, /^Player_\d{4}$/);
});

test("afterAuthenticateDevice assigns Player_<random4> when user has no display name", () => {
  let updatedUserId: string | null = null;
  let updatedDisplayName: string | null = null;

  const mockNk = {
    accountGetId: (userId: string) => ({
      user: { id: userId, username: "device_user", displayName: "" },
      email: ""
    }),
    accountUpdateId: (
      userId: string,
      _username: string | null,
      displayName: string | null
    ) => {
      updatedUserId = userId;
      updatedDisplayName = displayName;
    }
  } as unknown as nkruntime.Nakama;

  const mockLogger = {
    info: () => {},
    error: () => {}
  } as unknown as nkruntime.Logger;

  const ctx = { userId: "guest-user-123" } as nkruntime.Context;
  const session = { created: true } as nkruntime.Session;
  const request = {} as nkruntime.AuthenticateDeviceRequest;

  afterAuthenticateDevice(ctx, mockLogger, mockNk, session, request);

  assert.equal(updatedUserId, "guest-user-123");
  assert.ok(updatedDisplayName);
  assert.match(updatedDisplayName as string, /^Player_\d{4}$/);
});

test("afterAuthenticateDevice preserves existing display name", () => {
  let calledUpdate = false;

  const mockNk = {
    accountGetId: (userId: string) => ({
      user: { id: userId, username: "device_user", displayName: "CustomName" },
      email: ""
    }),
    accountUpdateId: () => {
      calledUpdate = true;
    }
  } as unknown as nkruntime.Nakama;

  const mockLogger = {
    info: () => {},
    error: () => {}
  } as unknown as nkruntime.Logger;

  const ctx = { userId: "guest-user-123" } as nkruntime.Context;
  const session = { created: false } as nkruntime.Session;
  const request = {} as nkruntime.AuthenticateDeviceRequest;

  afterAuthenticateDevice(ctx, mockLogger, mockNk, session, request);

  assert.equal(calledUpdate, false);
});

test("afterAuthenticateDevice ignores accounts that have email set", () => {
  let calledUpdate = false;

  const mockNk = {
    accountGetId: (userId: string) => ({
      user: { id: userId, username: "device_user", displayName: "" },
      email: "user@example.com"
    }),
    accountUpdateId: () => {
      calledUpdate = true;
    }
  } as unknown as nkruntime.Nakama;

  const mockLogger = {
    info: () => {},
    error: () => {}
  } as unknown as nkruntime.Logger;

  const ctx = { userId: "guest-user-123" } as nkruntime.Context;
  const session = { created: false } as nkruntime.Session;
  const request = {} as nkruntime.AuthenticateDeviceRequest;

  afterAuthenticateDevice(ctx, mockLogger, mockNk, session, request);

  assert.equal(calledUpdate, false);
});

test("afterAuthenticateDevice falls back to usersGetId if accountGetId is unavailable", () => {
  let updatedDisplayName: string | null = null;

  const mockNk = {
    usersGetId: (ids: string[]) => [
      { id: ids[0], username: "device_user", displayName: "" }
    ],
    accountUpdateId: (
      _userId: string,
      _username: string | null,
      displayName: string | null
    ) => {
      updatedDisplayName = displayName;
    }
  } as unknown as nkruntime.Nakama;

  const mockLogger = {
    info: () => {},
    error: () => {}
  } as unknown as nkruntime.Logger;

  const ctx = { userId: "guest-user-456" } as nkruntime.Context;
  const session = { created: true } as nkruntime.Session;
  const request = {} as nkruntime.AuthenticateDeviceRequest;

  afterAuthenticateDevice(ctx, mockLogger, mockNk, session, request);

  assert.ok(updatedDisplayName);
  assert.match(updatedDisplayName as string, /^Player_\d{4}$/);
});
