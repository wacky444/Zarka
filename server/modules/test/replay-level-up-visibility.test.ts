import assert from "node:assert/strict";
import test from "node:test";
import type { ReplayEvent } from "@shared";
import { tailorReplayEvents } from "../src/match/replay/tailorReplay";

test("tailorReplayEvents hides levelsGained and experienceGained from non-actors unless viewAll is true", () => {
  const events: ReplayEvent[] = [
    {
      kind: "player",
      importance: 3,
      actorId: "shooter",
      targets: [{ targetId: "victim" }],
      action: {
        actionId: "shoot_pistol",
        metadata: {
          experienceGained: 10,
          levelsGained: 1,
          kills: 1,
        },
      },
      visibility: {
        scope: "limited",
        playerIds: ["shooter", "victim", "listener"],
      },
    },
  ];

  const actorView = tailorReplayEvents(events, "shooter", undefined, 0);
  assert.equal(actorView.length, 1);
  assert.deepEqual((actorView[0] as any).action.metadata, {
    experienceGained: 10,
    levelsGained: 1,
    kills: 1,
  });

  const listenerView = tailorReplayEvents(events, "listener", undefined, 0);
  assert.equal(listenerView.length, 1);
  assert.deepEqual((listenerView[0] as any).action.metadata, {
    kills: 1,
  });

  const victimView = tailorReplayEvents(events, "victim", undefined, 0);
  assert.equal(victimView.length, 1);
  assert.equal((victimView[0] as any).action.metadata.levelsGained, undefined);
  assert.equal((victimView[0] as any).action.metadata.experienceGained, undefined);

  const adminView = tailorReplayEvents(events, "admin", undefined, 0, true);
  assert.equal(adminView.length, 1);
  assert.deepEqual((adminView[0] as any).action.metadata, {
    experienceGained: 10,
    levelsGained: 1,
    kills: 1,
  });
});

test("tailorReplayEvents omits metadata entirely when only experienceGained and levelsGained were present", () => {
  const events: ReplayEvent[] = [
    {
      kind: "player",
      importance: 1,
      actorId: "actor",
      action: {
        actionId: "move",
        metadata: {
          experienceGained: 5,
          levelsGained: 1,
        },
      },
      visibility: {
        scope: "all",
      },
    },
  ];

  const observerView = tailorReplayEvents(events, "observer", undefined, 0);
  assert.equal(observerView.length, 1);
  assert.equal("metadata" in (observerView[0] as any).action, false);
});
