import assert from "node:assert/strict";
import { test } from "node:test";
import type { ReplayEvent } from "@shared";
import { tailorReplayEvents } from "../src/match/replay/tailorReplay";

test("public elimination and destruction notices survive replay tailoring", () => {
  const events: ReplayEvent[] = [
    {
      kind: "player",
      actorId: "victim",
      action: {
        actionId: "status_dead",
        metadata: { previous: 1, current: 0, teamId: "secret-team" },
      },
      targets: [
        {
          targetId: "victim",
          eliminated: true,
          metadata: { teamId: "secret-team" },
        },
      ],
      visibility: { scope: "limited", playerIds: ["victim"] },
    },
    {
      kind: "player",
      actorId: "attacker",
      action: { actionId: "knife_attack" },
      targets: [{ targetId: "victim", damageTaken: 1 }],
    },
    {
      kind: "map",
      cell: { q: 100, r: -100 },
      action: "destroyed",
      visibility: { scope: "all" },
    },
    {
      kind: "map",
      cell: { q: 100, r: -100 },
      action: "destroyed",
    },
  ];

  assert.deepEqual(tailorReplayEvents(events, "observer", undefined, 0), [
    {
      kind: "player",
      actorId: "victim",
      action: { actionId: "status_dead" },
      visibility: { scope: "all" },
    },
    {
      kind: "map",
      cell: { q: 100, r: -100 },
      action: "destroyed",
      visibility: { scope: "all" },
    },
  ]);
});
