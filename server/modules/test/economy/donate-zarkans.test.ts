import assert from "node:assert/strict";
import { test } from "node:test";
import type { MatchRecord } from "../../src/models/types";
import { createDefaultCharacter } from "../../src/utils/playerCharacter";
import { donateZarkansRpc } from "../../src/rpc/donateZarkans";
import { asyncTurnMatchSignal } from "../../src/match/async_turn/signal";
import type { AsyncTurnState } from "../../src/models/types";
import { OPCODE_ZARKANS_DONATED } from "@shared";
import { MATCH_COLLECTION, MATCH_KEY_PREFIX, SERVER_USER_ID } from "../../src/constants";

const runtimeGlobals = globalThis as unknown as {
  nkruntime?: { Codes: Record<string, number> };
};
runtimeGlobals.nkruntime = {
  Codes: {
    INVALID_ARGUMENT: 3,
    NOT_FOUND: 5,
    PERMISSION_DENIED: 7,
    FAILED_PRECONDITION: 9,
    ABORTED: 10
  }
};

type StoredMatch = {
  value: MatchRecord;
  version: string;
};

function createMatch(): MatchRecord {
  const donor = createDefaultCharacter("donor");
  donor.economy.zarkans = 10;
  const recipient = createDefaultCharacter("recipient");
  recipient.economy.zarkans = 5;
  return {
    match_id: "logical-match",
    runtime_match_id: "runtime-match",
    players: ["donor", "recipient"],
    playerCharacters: { donor, recipient },
    playerList: {},
    size: 2,
    created_at: 1,
    current_turn: 4,
    started: true,
    removed: 0
  };
}

function createNakama(initialMatch = createMatch()) {
  let stored: StoredMatch = { value: initialMatch, version: "version-1" };
  const signals: Array<{ matchId: string; data: string }> = [];
  const fake = {
    storageRead: (requests: nkruntime.StorageReadRequest[]) =>
      requests
        .filter(
          (request) =>
            request.collection === MATCH_COLLECTION &&
            request.key === `${MATCH_KEY_PREFIX}${initialMatch.match_id}` &&
            request.userId === SERVER_USER_ID
        )
        .map((request) => ({
          collection: request.collection,
          key: request.key,
          userId: request.userId,
          value: stored.value,
          version: stored.version,
          permissionRead: 2,
          permissionWrite: 0,
          createTime: 0,
          updateTime: 0
        })),
    storageWrite: (requests: nkruntime.StorageWriteRequest[]) => {
      const request = requests[0];
      if (!request || request.version !== stored.version) {
        throw new Error("version conflict");
      }
      stored = {
        value: request.value as MatchRecord,
        version: "version-2"
      };
      return [];
    },
    storageList: () => ({ objects: [], cursor: "" }),
    storageDelete: () => undefined,
    matchCreate: () => "",
    matchList: () => ({ matches: [] }),
    matchSignal: (matchId: string, data: string) => {
      signals.push({ matchId, data });
      return "ok";
    }
  } as unknown as nkruntime.Nakama;
  const logger = {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined
  } as unknown as nkruntime.Logger;
  return {
    nk: fake,
    logger,
    signals,
    getMatch: () => stored.value
  };
}

function callDonation(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  userId: string,
  donation: Record<string, unknown>
): string {
  return donateZarkansRpc(
    { userId } as nkruntime.Context,
    logger,
    nk,
    JSON.stringify(donation)
  );
}

function thrownCode(callback: () => unknown): number | undefined {
  try {
    callback();
  } catch (error) {
    return typeof error === "object" && error !== null && "code" in error
      ? (error as { code?: number }).code
      : undefined;
  }
  return undefined;
}

test("donation transfers zarkans immediately and signals both participants", () => {
  const harness = createNakama();
  const result = JSON.parse(
    callDonation(harness.nk, harness.logger, "donor", {
      match_id: "logical-match",
      recipient_id: "recipient",
      amount: 7
    })
  ) as {
    ok: boolean;
    donor_balance: number;
    amount: number;
  };

  assert.equal(result.ok, true);
  assert.equal(result.amount, 7);
  assert.equal(result.donor_balance, 3);
  assert.equal(harness.getMatch().current_turn, 4);
  assert.equal(harness.getMatch().playerCharacters.donor.economy.zarkans, 3);
  assert.equal(harness.getMatch().playerCharacters.recipient.economy.zarkans, 12);
  assert.deepEqual(harness.signals, [
    {
      matchId: "runtime-match",
      data: JSON.stringify({
        type: "zarkans_donated",
        match_id: "logical-match",
        donor_id: "donor",
        recipient_id: "recipient"
      })
    }
  ]);
});

test("donation realtime signal only targets donor and recipient", () => {
  const harness = createNakama();
  const targetedPresences: nkruntime.Presence[] = [];
  let opcode = 0;
  const dispatcher = {
    broadcastMessage: (
      opCode: number,
      _data: string,
      presences: nkruntime.Presence[] | null
    ) => {
      opcode = opCode;
      targetedPresences.push(...(presences ?? []));
    }
  } as unknown as nkruntime.MatchDispatcher;
  const state = {
    game_id: "logical-match",
    players: {
      donor: { userId: "donor" },
      recipient: { userId: "recipient" },
      spectator: { userId: "spectator" }
    }
  } as unknown as AsyncTurnState;

  asyncTurnMatchSignal(
    { userId: "donor" } as nkruntime.Context,
    harness.logger,
    harness.nk,
    dispatcher,
    0,
    state,
    JSON.stringify({
      type: "zarkans_donated",
      donor_id: "donor",
      recipient_id: "recipient"
    })
  );

  assert.equal(opcode, OPCODE_ZARKANS_DONATED);
  assert.deepEqual(
    targetedPresences.map((presence) => presence.userId),
    ["donor", "recipient"]
  );
});

test("donation rejects invalid amounts, self-targets, and insufficient balance", () => {
  const harness = createNakama();
  const base = { match_id: "logical-match", recipient_id: "recipient" };
  assert.equal(
    thrownCode(() => callDonation(harness.nk, harness.logger, "donor", { ...base, amount: 0 })),
    3
  );
  assert.equal(
    thrownCode(() => callDonation(harness.nk, harness.logger, "donor", { ...base, amount: 1.5 })),
    3
  );
  assert.equal(
    thrownCode(() =>
      callDonation(harness.nk, harness.logger, "donor", {
        ...base,
        recipient_id: "donor",
        amount: 1
      })
    ),
    3
  );
  assert.equal(
    thrownCode(() => callDonation(harness.nk, harness.logger, "donor", { ...base, amount: 11 })),
    9
  );
  assert.equal(harness.getMatch().playerCharacters.donor.economy.zarkans, 10);
  assert.equal(harness.signals.length, 0);
});

test("donation requires an active match and living in-match target", () => {
  const ended = createMatch();
  ended.started = false;
  const endedHarness = createNakama(ended);
  assert.equal(
    thrownCode(() =>
      callDonation(endedHarness.nk, endedHarness.logger, "donor", {
        match_id: "logical-match",
        recipient_id: "recipient",
        amount: 1
      })
    ),
    9
  );

  const deadRecipientMatch = createMatch();
  deadRecipientMatch.playerCharacters.recipient.statuses.conditions.push("dead");
  const deadRecipientHarness = createNakama(deadRecipientMatch);
  assert.equal(
    thrownCode(() =>
      callDonation(deadRecipientHarness.nk, deadRecipientHarness.logger, "donor", {
        match_id: "logical-match",
        recipient_id: "recipient",
        amount: 1
      })
    ),
    9
  );

  const unauthorizedHarness = createNakama();
  assert.equal(
    thrownCode(() =>
      callDonation(unauthorizedHarness.nk, unauthorizedHarness.logger, "outsider", {
        match_id: "logical-match",
        recipient_id: "recipient",
        amount: 1
      })
    ),
    7
  );
});
