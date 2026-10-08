import assert from "node:assert/strict";
import { test } from "node:test";
import { getUserAccountRpc } from "../src/rpc/getUserAccount";

type AccountResponse = {
  ok?: boolean;
  error?: string;
  account?: { rankedMatchSlots?: number };
};

function getAccount(metadata: unknown, payload = ""): AccountResponse {
  const user = {
    id: "self-user",
    username: "self-user",
    metadata
  } as unknown as nkruntime.User;
  const nakama = {
    usersGetId: (userIds: string[]) =>
      userIds.includes("self-user") ? [user] : []
  } as unknown as nkruntime.Nakama;

  return JSON.parse(
    getUserAccountRpc(
      { userId: "self-user" } as nkruntime.Context,
      {} as nkruntime.Logger,
      nakama,
      payload
    )
  ) as AccountResponse;
}

test("get_user_account defaults missing ranked slots to zero", () => {
  for (const metadata of [undefined, {}, { zarka: {} }]) {
    const response = getAccount(metadata);
    assert.equal(response.ok, true);
    assert.equal(response.account?.rankedMatchSlots, 0);
  }
});

test("get_user_account preserves valid ranked slot counts", () => {
  for (const value of [0, 1, 2, 3]) {
    const response = getAccount({ zarka: { rankedMatchSlots: value } });
    assert.equal(response.ok, true);
    assert.equal(response.account?.rankedMatchSlots, value);
  }
});

test("get_user_account normalizes invalid ranked slot values to zero", () => {
  for (const value of [-1, 4, 1.5, "2", null, true]) {
    const response = getAccount({ zarka: { rankedMatchSlots: value } });
    assert.equal(response.ok, true);
    assert.equal(response.account?.rankedMatchSlots, 0);
  }
});

test("get_user_account still forbids requesting another user's account", () => {
  const response = getAccount(
    { zarka: { rankedMatchSlots: 3 } },
    JSON.stringify({ user_id: "another-user" })
  );
  assert.equal(response.error, "forbidden");
  assert.equal(response.account, undefined);
});
