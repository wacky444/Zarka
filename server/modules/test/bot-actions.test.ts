import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ActionLibrary,
  CellLibrary,
  LocalizationType,
  ItemLibrary,
  type HexTileSnapshot,
  type MatchRecord,
  type PlayerCharacter,
} from "@shared";
import { processBotActions } from "../src/match/botAI";
import { createDefaultCharacter } from "../src/utils/playerCharacter";

const logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

function createCharacter(
  id: string,
  teamId: string,
  tileId = "shared",
  coord = { q: 0, r: 0 }
): PlayerCharacter {
  const character = createDefaultCharacter(id);
  character.teamId = teamId;
  character.position = { tileId, coord: { ...coord } };
  character.stats.energy.current = 20;
  character.stats.energy.max = 20;
  character.stats.load = {
    current: 0,
    max: 25,
    bandolierCapacityBonus: 0,
  };
  return character;
}

function createTile(
  id: string,
  coord: { q: number; r: number },
  localizationType: LocalizationType = LocalizationType.Road,
  itemIds: string[] = []
): HexTileSnapshot {
  return {
    id,
    coord,
    localizationType,
    walkable: true,
    itemIds,
  };
}

function createMatch(
  characters: PlayerCharacter[],
  tiles: HexTileSnapshot[],
  items: NonNullable<MatchRecord["items"]> = []
): MatchRecord {
  return {
    match_id: "bot-actions-test",
    players: characters.filter((character) => !/^bot\d+$/i.test(character.id)).map(
      (character) => character.id
    ),
    playerCharacters: Object.fromEntries(
      characters.map((character) => [character.id, character])
    ),
    playerList: {},
    size: characters.length,
    created_at: 1,
    current_turn: 1,
    started: true,
    removed: 0,
    map: { cols: 4, rows: 4, seed: "bot-actions", tiles },
    items,
  };
}

function allowOnlyAction(character: PlayerCharacter, actionId: string): void {
  character.statuses.cooldowns = Object.values(ActionLibrary)
    .filter((definition) => definition.id !== actionId)
    .map((definition) => ({
      actionId: definition.id,
      availableOnTurn: 100,
      remainingTurns: 98,
    }));
}

function withRandom<T>(random: () => number, callback: () => T): T {
  const originalRandom = Math.random;
  Math.random = random;
  try {
    return callback();
  } finally {
    Math.random = originalRandom;
  }
}

function chooseBotPlan(
  match: MatchRecord,
  playerId = "bot1"
): PlayerCharacter["actionPlan"] {
  withRandom(() => 0, () => processBotActions(match, logger));
  return match.playerCharacters?.[playerId].actionPlan;
}

test("bot uses create_fire against an enemy when fuel covers target distance", () => {
  const bot = createCharacter("bot1", "bots", "origin", { q: 0, r: 0 });
  const enemy = createCharacter("human", "humans", "enemy-tile", { q: 1, r: 0 });
  bot.inventory.carriedItems = [{ itemId: "fuel", quantity: 5, weight: 10 }];
  const match = createMatch(
    [bot, enemy],
    [
      createTile("origin", { q: 0, r: 0 }),
      createTile("enemy-tile", { q: 1, r: 0 }),
    ]
  );
  allowOnlyAction(bot, ActionLibrary.create_fire.id);

  const plan = chooseBotPlan(match)?.main;

  assert.equal(plan?.actionId, ActionLibrary.create_fire.id);
  assert.deepEqual(plan?.targetLocationId, { q: 1, r: 0 });
});

test("bot uses breakfast below half energy at a restaurant", () => {
  const bot = createCharacter("bot1", "bots", "restaurant");
  bot.stats.energy.current = 9;
  const match = createMatch(
    [bot],
    [
      createTile(
        "restaurant",
        { q: 0, r: 0 },
        LocalizationType.Restaurant
      ),
    ]
  );
  allowOnlyAction(bot, ActionLibrary.breakfast.id);

  const plan = chooseBotPlan(match)?.main;

  assert.equal(plan?.actionId, ActionLibrary.breakfast.id);
});

test("bot refuels only when added fuel fits its remaining load capacity", () => {
  const bot = createCharacter("bot1", "bots", "gas-station");
  bot.stats.load.current = 18;
  const match = createMatch(
    [bot],
    [
      createTile(
        "gas-station",
        { q: 0, r: 0 },
        LocalizationType.GasStation
      ),
    ]
  );
  allowOnlyAction(bot, ActionLibrary.refuel.id);

  assert.equal(chooseBotPlan(match)?.main?.actionId, ActionLibrary.refuel.id);

  bot.stats.load.current = 20;
  assert.equal(chooseBotPlan(match)?.main, undefined);
});

test("bot places C4 when enemy is nearby and it carries a charge", () => {
  const bot = createCharacter("bot1", "bots", "origin", { q: 0, r: 0 });
  const enemy = createCharacter("human", "humans", "enemy-tile", { q: 1, r: 0 });
  bot.inventory.carriedItems = [{ itemId: "c4", quantity: 1, weight: 1 }];
  const match = createMatch(
    [bot, enemy],
    [
      createTile("origin", { q: 0, r: 0 }),
      createTile("enemy-tile", { q: 1, r: 0 }),
    ]
  );
  allowOnlyAction(bot, ActionLibrary.place_c4.id);

  assert.equal(chooseBotPlan(match)?.main?.actionId, ActionLibrary.place_c4.id);
});

test("bot detonates its C4 on an enemy when carrying a detonator", () => {
  const bot = createCharacter("bot1", "bots", "origin", { q: 0, r: 0 });
  const enemy = createCharacter("human", "humans", "enemy-tile", { q: 1, r: 0 });
  bot.inventory.carriedItems = [
    { itemId: "detonator", quantity: 1, weight: ItemLibrary.detonator.weight },
  ];
  const match = createMatch(
    [bot, enemy],
    [
      createTile("origin", { q: 0, r: 0 }),
      createTile("enemy-tile", { q: 1, r: 0 }),
    ]
  );
  match.c4s = [
    {
      id: "owned-charge",
      ownerId: bot.id,
      tileId: "enemy-tile",
      coord: { q: 1, r: 0 },
      placedTurn: 1,
    },
  ];
  allowOnlyAction(bot, ActionLibrary.detonate_c4.id);

  const plan = chooseBotPlan(match)?.main;

  assert.equal(plan?.actionId, ActionLibrary.detonate_c4.id);
  assert.deepEqual(plan?.targetLocationId, { q: 1, r: 0 });
});

test("Aggressive bot self-detonates when at least two enemies share its C4 tile", () => {
  const bot = createCharacter("bot2", "bots", "shared", { q: 0, r: 0 });
  const enemy1 = createCharacter("human1", "humans", "shared", { q: 0, r: 0 });
  const enemy2 = createCharacter("human2", "humans", "shared", { q: 0, r: 0 });
  bot.inventory.carriedItems = [
    { itemId: "detonator", quantity: 1, weight: ItemLibrary.detonator.weight },
  ];
  const match = createMatch(
    [bot, enemy1, enemy2],
    [createTile("shared", { q: 0, r: 0 })]
  );
  match.c4s = [
    {
      id: "owned-charge",
      ownerId: bot.id,
      tileId: "shared",
      coord: { q: 0, r: 0 },
      placedTurn: 1,
    },
  ];
  allowOnlyAction(bot, ActionLibrary.detonate_c4.id);

  const plan = chooseBotPlan(match, bot.id)?.main;

  assert.equal(plan?.actionId, ActionLibrary.detonate_c4.id);
  assert.deepEqual(plan?.targetLocationId, { q: 0, r: 0 });
});

test("non-Aggressive bot avoids self-detonation even with two enemies", () => {
  const bot = createCharacter("bot1", "bots", "shared", { q: 0, r: 0 });
  const enemy1 = createCharacter("human1", "humans", "shared", { q: 0, r: 0 });
  const enemy2 = createCharacter("human2", "humans", "shared", { q: 0, r: 0 });
  bot.inventory.carriedItems = [
    { itemId: "detonator", quantity: 1, weight: ItemLibrary.detonator.weight },
  ];
  const match = createMatch(
    [bot, enemy1, enemy2],
    [createTile("shared", { q: 0, r: 0 })]
  );
  match.c4s = [
    {
      id: "owned-charge",
      ownerId: bot.id,
      tileId: "shared",
      coord: { q: 0, r: 0 },
      placedTurn: 1,
    },
  ];
  allowOnlyAction(bot, ActionLibrary.detonate_c4.id);

  assert.equal(chooseBotPlan(match)?.main, undefined);
});

test("Aggressive bot still avoids C4 detonation on a teammate", () => {
  const bot = createCharacter("bot2", "bots", "shared", { q: 0, r: 0 });
  const enemy1 = createCharacter("human1", "humans", "shared", { q: 0, r: 0 });
  const enemy2 = createCharacter("human2", "humans", "shared", { q: 0, r: 0 });
  const teammate = createCharacter("bot3", "bots", "shared", { q: 0, r: 0 });
  bot.inventory.carriedItems = [
    { itemId: "detonator", quantity: 1, weight: ItemLibrary.detonator.weight },
  ];
  const match = createMatch(
    [bot, enemy1, enemy2, teammate],
    [createTile("shared", { q: 0, r: 0 })]
  );
  match.c4s = [
    {
      id: "owned-charge",
      ownerId: bot.id,
      tileId: "shared",
      coord: { q: 0, r: 0 },
      placedTurn: 1,
    },
  ];
  allowOnlyAction(bot, ActionLibrary.detonate_c4.id);

  assert.equal(chooseBotPlan(match, bot.id)?.main, undefined);
});

test("bot does not detonate C4 on a teammate", () => {
  const bot = createCharacter("bot1", "bots", "origin", { q: 0, r: 0 });
  const enemy = createCharacter("human", "humans", "target", { q: 1, r: 0 });
  const teammate = createCharacter("bot2", "bots", "target", { q: 1, r: 0 });
  bot.inventory.carriedItems = [
    { itemId: "detonator", quantity: 1, weight: ItemLibrary.detonator.weight },
  ];
  const match = createMatch(
    [bot, enemy, teammate],
    [
      createTile("origin", { q: 0, r: 0 }),
      createTile("target", { q: 1, r: 0 }),
    ]
  );
  match.c4s = [
    {
      id: "owned-charge",
      ownerId: bot.id,
      tileId: "target",
      coord: { q: 1, r: 0 },
      placedTurn: 1,
    },
  ];
  allowOnlyAction(bot, ActionLibrary.detonate_c4.id);

  assert.equal(chooseBotPlan(match)?.main, undefined);
});

test("bot places trap on a valid untrapped adjacent edge", () => {
  const bot = createCharacter("bot1", "bots", "origin", { q: 0, r: 0 });
  bot.inventory.carriedItems = [{ itemId: "trap", quantity: 1, weight: 1 }];
  const match = createMatch(
    [bot],
    [
      createTile("origin", { q: 0, r: 0 }),
      createTile("destination", { q: 1, r: 0 }),
    ]
  );
  allowOnlyAction(bot, ActionLibrary.place_trap.id);

  const plan = chooseBotPlan(match)?.main;

  assert.equal(plan?.actionId, ActionLibrary.place_trap.id);
  assert.deepEqual(plan?.targetLocationId, { q: 1, r: 0 });
});

test("bot avoids moving across its own trap", () => {
  const bot = createCharacter("bot1", "bots", "origin", { q: 0, r: 0 });
  const match = createMatch(
    [bot],
    [
      createTile("origin", { q: 0, r: 0 }),
      createTile("trapped", { q: 1, r: 0 }),
    ]
  );
  match.traps = [
    {
      id: "owned-trap",
      ownerId: bot.id,
      from: { tileId: "origin", coord: { q: 0, r: 0 } },
      to: { tileId: "trapped", coord: { q: 1, r: 0 } },
      damage: 7,
      placedTurn: 1,
    },
  ];
  allowOnlyAction(bot, ActionLibrary.move.id);

  assert.equal(chooseBotPlan(match)?.main, undefined);
});

test("bot dodges when enemy is in adjacent range", () => {
  const bot = createCharacter("bot1", "bots", "origin", { q: 0, r: 0 });
  const enemy = createCharacter("human", "humans", "enemy-tile", { q: 1, r: 0 });
  const match = createMatch(
    [bot, enemy],
    [
      createTile("origin", { q: 0, r: 0 }),
      createTile("enemy-tile", { q: 1, r: 0 }),
    ]
  );
  allowOnlyAction(bot, ActionLibrary.dodge.id);

  assert.equal(chooseBotPlan(match)?.main?.actionId, ActionLibrary.dodge.id);
});

test("bot picks up visible item only when resulting load stays within capacity", () => {
  const bot = createCharacter("bot1", "bots", "item-tile");
  bot.stats.load.current = 24;
  bot.discoveredItemIds = ["wood-item"];
  const match = createMatch(
    [bot],
    [createTile("item-tile", { q: 0, r: 0 }, LocalizationType.Road, ["wood-item"])],
    [{ item_id: "wood-item", item_type: "wood" }]
  );
  allowOnlyAction(bot, ActionLibrary.pick_up.id);

  assert.deepEqual(
    chooseBotPlan(match)?.main?.targetItemIds,
    ["wood-item"]
  );

  bot.stats.load.current = 25;
  assert.equal(chooseBotPlan(match)?.main, undefined);
});

test("bot drops a heavy carried item above 75 percent load", () => {
  const bot = createCharacter("bot1", "bots");
  bot.stats.load.current = 20;
  bot.inventory.carriedItems = [{ itemId: "axe", quantity: 1, weight: 5 }];
  const match = createMatch(
    [bot],
    [createTile("shared", { q: 0, r: 0 })]
  );
  allowOnlyAction(bot, ActionLibrary.drop.id);

  const plan = chooseBotPlan(match)?.main;

  assert.equal(plan?.actionId, ActionLibrary.drop.id);
  assert.deepEqual(plan?.targetItemIds, ["axe"]);
});

test("bot throws a Molotov at an enemy even when load is below 75 percent", () => {
  const bot = createCharacter("bot1", "bots", "origin", { q: 0, r: 0 });
  const enemy = createCharacter("human", "humans", "enemy-tile", { q: 1, r: 0 });
  bot.stats.load.current = 10;
  bot.inventory.carriedItems = [{ itemId: "molotov", quantity: 1, weight: 3 }];
  const match = createMatch(
    [bot, enemy],
    [
      createTile("origin", { q: 0, r: 0 }),
      createTile("enemy-tile", { q: 1, r: 0 }),
    ]
  );
  allowOnlyAction(bot, ActionLibrary.throw_object.id);

  const plan = chooseBotPlan(match)?.main;

  assert.equal(plan?.actionId, ActionLibrary.throw_object.id);
  assert.deepEqual(plan?.targetLocationId, { q: 1, r: 0 });
  assert.deepEqual(plan?.targetItemIds, ["molotov"]);
});

test("bot can throw a heavy item when carrying load exceeds 75 percent", () => {
  const bot = createCharacter("bot1", "bots", "origin", { q: 0, r: 0 });
  const enemy = createCharacter("human", "humans", "enemy-tile", { q: 1, r: 0 });
  bot.stats.load.current = 20;
  bot.inventory.carriedItems = [{ itemId: "axe", quantity: 1, weight: 5 }];
  const match = createMatch(
    [bot, enemy],
    [
      createTile("origin", { q: 0, r: 0 }),
      createTile("enemy-tile", { q: 1, r: 0 }),
    ]
  );
  allowOnlyAction(bot, ActionLibrary.throw_object.id);

  const plan = chooseBotPlan(match)?.main;

  assert.equal(plan?.actionId, ActionLibrary.throw_object.id);
  assert.deepEqual(plan?.targetItemIds, ["axe"]);
});

test("bot can fire a rocket launcher at an enemy without a teammate at that cell", () => {
  const bot = createCharacter("bot1", "bots", "origin", { q: 0, r: 0 });
  const enemy = createCharacter("human", "humans", "enemy-tile", { q: 1, r: 0 });
  bot.inventory.carriedItems = [
    { itemId: "rocket_launcher", quantity: 1, weight: ItemLibrary.rocket_launcher.weight },
  ];
  const match = createMatch(
    [bot, enemy],
    [
      createTile("origin", { q: 0, r: 0 }),
      createTile("enemy-tile", { q: 1, r: 0 }),
    ]
  );
  allowOnlyAction(bot, ActionLibrary.fire_rocket_launcher.id);

  const plan = chooseBotPlan(match)?.main;

  assert.equal(plan?.actionId, ActionLibrary.fire_rocket_launcher.id);
  assert.deepEqual(plan?.targetLocationId, { q: 1, r: 0 });
});

test("bot steals from co-located enemy when carrying less than half capacity", () => {
  const bot = createCharacter("bot1", "bots");
  const enemy = createCharacter("human", "humans");
  bot.stats.load.current = 12;
  enemy.inventory.carriedItems = [{ itemId: "axe", quantity: 1, weight: 5 }];
  const match = createMatch(
    [bot, enemy],
    [createTile("shared", { q: 0, r: 0 })]
  );
  allowOnlyAction(bot, ActionLibrary.steal.id);

  const plan = chooseBotPlan(match)?.main;

  assert.equal(plan?.actionId, ActionLibrary.steal.id);
  assert.deepEqual(plan?.targetPlayerIds, [enemy.id]);
});

test("bot sells a valuable heavy item at market when load exceeds half", () => {
  const bot = createCharacter("bot1", "bots", "market");
  bot.stats.load.current = 13;
  bot.inventory.carriedItems = [{ itemId: "axe", quantity: 1, weight: 5 }];
  const match = createMatch(
    [bot],
    [createTile("market", { q: 0, r: 0 }, LocalizationType.Market)]
  );
  allowOnlyAction(bot, ActionLibrary.black_market_trade.id);

  const plan = chooseBotPlan(match)?.main;

  assert.equal(plan?.actionId, ActionLibrary.black_market_trade.id);
  assert.deepEqual(plan?.targetItemIds, ["axe"]);
});

test("bot injects virus into uninfected enemy sharing its location", () => {
  const bot = createCharacter("bot1", "bots");
  const enemy = createCharacter("human", "humans");
  bot.inventory.carriedItems = [{ itemId: "virus", quantity: 1, weight: 1 }];
  const match = createMatch(
    [bot, enemy],
    [createTile("shared", { q: 0, r: 0 })]
  );
  allowOnlyAction(bot, ActionLibrary.inject_virus.id);

  const plan = chooseBotPlan(match)?.main;

  assert.equal(plan?.actionId, ActionLibrary.inject_virus.id);
  assert.deepEqual(plan?.targetPlayerIds, [enemy.id]);
});

test("bot vaccinates itself when an infected character shares its location", () => {
  const bot = createCharacter("bot1", "bots");
  const infected = createCharacter("human", "humans");
  bot.inventory.carriedItems = [{ itemId: "vaccine", quantity: 1, weight: 1 }];
  infected.statuses.conditions.push("infected");
  const match = createMatch(
    [bot, infected],
    [createTile("shared", { q: 0, r: 0 })]
  );
  allowOnlyAction(bot, ActionLibrary.inject_vaccine.id);

  const plan = chooseBotPlan(match)?.main;

  assert.equal(plan?.actionId, ActionLibrary.inject_vaccine.id);
  assert.deepEqual(plan?.targetPlayerIds, [bot.id]);
});
