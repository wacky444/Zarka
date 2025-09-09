/// <reference path="../node_modules/nakama-runtime/index.d.ts" />
const MATCH_COLLECTION = "async_turn_matches";
const TURN_COLLECTION = "async_turn_turns";
const MATCH_KEY_PREFIX = "match_";
const SERVER_USER_ID = "00000000-0000-0000-0000-000000000000";

// Types of objects we store
interface MatchRecord {
  match_id: string;
  players: string[];
  size: number;
  created_at: number;
  current_turn: number;
}

interface TurnRecord {
  match_id: string;
  turn: number;
  player: string;
  move: any;
  created_at: number;
}

// RPC: create_match
function create_match(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
  let size = 2;
  if (payload && payload !== "") {
    try {
      const json = JSON.parse(payload);
      if (json && typeof json.size === "number") {
        size = json.size;
      }
    } catch (err) {
      // ignore bad payload, use default size
    }
  }

  // Create an authoritative match using our registered handler.
  // Pass parameters as strings to align with runtime typing.
  const params: { [key: string]: string } = { size: String(size) };
  const matchId = nk.matchCreate("async_turn", params);

  const record: MatchRecord = {
    match_id: matchId,
    players: [],
    size: size,
    created_at: Math.floor(Date.now() / 1000),
    current_turn: 0,
  };

  const write: nkruntime.StorageWriteRequest = {
    collection: MATCH_COLLECTION,
    key: MATCH_KEY_PREFIX + matchId,
    userId: SERVER_USER_ID,
    value: record,
    permissionRead: 2,
    permissionWrite: 0,
  };

  nk.storageWrite([write]);
  return JSON.stringify({ match_id: matchId, size });
}

// RPC: submit_turn
function submit_turn(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
  if (!ctx || !ctx.userId) {
    throw { message: "No user context", code: nkruntime.Codes.INVALID_ARGUMENT } as nkruntime.Error;
  }
  if (!payload || payload === "") {
    throw { message: "Missing payload", code: nkruntime.Codes.INVALID_ARGUMENT } as nkruntime.Error;
  }
  let json: any;
  try { json = JSON.parse(payload); } catch {
    throw { message: "bad_json", code: nkruntime.Codes.INVALID_ARGUMENT } as nkruntime.Error;
  }
  if (!json.match_id) {
    throw { message: "match_id required", code: nkruntime.Codes.INVALID_ARGUMENT } as nkruntime.Error;
  }
  const matchKey = MATCH_KEY_PREFIX + json.match_id;

  const reads = nk.storageRead([{ collection: MATCH_COLLECTION, key: matchKey, userId: SERVER_USER_ID }]);
  if (!reads || reads.length !== 1) {
    throw { message: "Match not found", code: nkruntime.Codes.NOT_FOUND } as nkruntime.Error;
  }
  const match = reads[0].value as MatchRecord;

  // Add player if new
  if (match.players.indexOf(ctx.userId) === -1) {
    match.players.push(ctx.userId);
  }

  // Turn index increments
  match.current_turn = (match.current_turn || 0) + 1;

  const turnRecord: TurnRecord = {
    match_id: json.match_id,
    turn: match.current_turn,
    player: ctx.userId,
    move: json.move,
    created_at: Math.floor(Date.now() / 1000),
  };

  const writes: nkruntime.StorageWriteRequest[] = [
    {
      collection: MATCH_COLLECTION,
      key: matchKey,
      userId: SERVER_USER_ID,
      value: match,
      permissionRead: 2,
      permissionWrite: 0,
      version: reads[0].version, // OCC
    },
    {
      collection: TURN_COLLECTION,
      key: `${match.current_turn}:${json.match_id}`,
      userId: SERVER_USER_ID,
      value: turnRecord,
      permissionRead: 2,
      permissionWrite: 0,
    },
  ];

  // Write both records in one call; version ensures OCC on match record
  nk.storageWrite(writes);

  return JSON.stringify({ ok: true, turn: match.current_turn });
}

// RPC: get_state
function get_state(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
  if (!payload || payload === "") {
    return JSON.stringify({ error: "missing_payload" });
  }
  let json: any;
  try { json = JSON.parse(payload); } catch {
    return JSON.stringify({ error: "bad_json" });
  }
  if (!json.match_id || json.match_id === "") {
    return JSON.stringify({ error: "match_id_required" });
  }
  const matchKey = MATCH_KEY_PREFIX + json.match_id;
  const records = nk.storageRead([{ collection: MATCH_COLLECTION, key: matchKey, userId: SERVER_USER_ID }]);
  if (!records || records.length === 0) {
    return JSON.stringify({ error: "not_found" });
  }
  const match = records[0].value as MatchRecord;

  // Fetch last 50 turns
  const limit = 50;
  const start = Math.max(1, (match.current_turn || 0) - limit + 1);
  const turnReads: nkruntime.StorageReadRequest[] = [];
  for (let i = start; i <= match.current_turn; i++) {
    turnReads.push({ collection: TURN_COLLECTION, key: `${i}:${json.match_id}`, userId: SERVER_USER_ID });
  }
  const turnResults = turnReads.length ? nk.storageRead(turnReads) : [];
  const turns: TurnRecord[] = [];
  for (const r of turnResults) {
    if (r && r.value) turns.push(r.value as TurnRecord);
  }
  return JSON.stringify({ match, turns });
}

function InitModule(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, initializer: nkruntime.Initializer) {
  try {
    initializer.registerRpc("create_match", create_match);
  } catch (error) {
    logger.error('Failed to register create_match: %s', (error && (error as Error).message) || String(error));
  }
  try {
    initializer.registerRpc("submit_turn", submit_turn);
  } catch (error) {
    logger.error('Failed to register submit_turn: %s', (error && (error as Error).message) || String(error));
  }
  try {
    initializer.registerRpc("get_state", get_state);
  } catch (error) {
    logger.error('Failed to register get_state: %s', (error && (error as Error).message) || String(error));
  }
  // Register the authoritative match handler used by create_match.
  try {
    initializer.registerMatch<AsyncTurnState>("async_turn", {
      matchInit: asyncTurnMatchInit,
      matchJoinAttempt: asyncTurnMatchJoinAttempt,
      matchJoin: asyncTurnMatchJoin,
      matchLeave: asyncTurnMatchLeave,
      matchLoop: asyncTurnMatchLoop,
      matchTerminate: asyncTurnMatchTerminate,
      matchSignal: asyncTurnMatchSignal,
    });
  } catch (error) {
    logger.error('Failed to register match handler async_turn: %s', (error && (error as Error).message) || String(error));
  }
  logger.info('TypeScript async_turn module loaded.');
}

// Reference InitModule to avoid it getting removed by bundlers.
!InitModule && InitModule.bind(null);

// ------------------------
// Authoritative Match Logic
// ------------------------

type AsyncTurnState = nkruntime.MatchState & {
  players: { [userId: string]: nkruntime.Presence };
  order: string[]; // join order
  size: number;
  current_turn: number;
  started: boolean;
};

const asyncTurnMatchInit: nkruntime.MatchInitFunction<AsyncTurnState> = function (ctx, logger, nk, params) {
  const sizeStr = params && params["size"];
  const size = Math.max(2, Math.min(8, parseInt(sizeStr || "2", 10) || 2));

  const state: AsyncTurnState = {
    players: {},
    order: [],
    size,
    current_turn: 0,
    started: false,
  };

  // Include some info in label for optional listing/filtering.
  const label = JSON.stringify({ mode: "async", size: String(size), players: 0, started: false });
  // Asynchronous turn-based can use a low tick rate.
  const tickRate = 1;
  return { state, tickRate, label };
};

const asyncTurnMatchJoinAttempt: nkruntime.MatchJoinAttemptFunction<AsyncTurnState> = function (ctx, logger, nk, dispatcher, tick, state, presence, metadata) {
  const alreadyJoined = !!state.players[presence.userId];
  const capacity = Object.keys(state.players).length + (alreadyJoined ? 0 : 1);
  const accept = capacity <= state.size;
  return accept ? { state, accept } : { state, accept: false, rejectMessage: "match_full" };
};

const asyncTurnMatchJoin: nkruntime.MatchJoinFunction<AsyncTurnState> = function (ctx, logger, nk, dispatcher, tick, state, presences) {
  for (const p of presences) {
    if (!state.players[p.userId]) {
      state.players[p.userId] = p;
      state.order.push(p.userId);
    }
  }
  const playerCount = Object.keys(state.players).length;
  if (!state.started && playerCount >= 2) {
    state.started = true;
  }
  // Update label to reflect current player count.
  try {
    const label = JSON.stringify({ mode: "async", size: String(state.size), players: playerCount, started: state.started });
    dispatcher.matchLabelUpdate(label);
  } catch (e) {
    // ignore label update errors
  }
  return { state };
};

const asyncTurnMatchLeave: nkruntime.MatchLeaveFunction<AsyncTurnState> = function (ctx, logger, nk, dispatcher, tick, state, presences) {
  for (const p of presences) {
    if (state.players[p.userId]) {
      delete state.players[p.userId];
      const idx = state.order.indexOf(p.userId);
      if (idx !== -1) state.order.splice(idx, 1);
    }
  }
  const playerCount = Object.keys(state.players).length;
  try {
    const label = JSON.stringify({ mode: "async", size: String(state.size), players: playerCount, started: state.started });
    dispatcher.matchLabelUpdate(label);
  } catch {}
  // End match when empty
  if (playerCount === 0) {
    return null;
  }
  return { state };
};

const asyncTurnMatchLoop: nkruntime.MatchLoopFunction<AsyncTurnState> = function (ctx, logger, nk, dispatcher, tick, state, messages) {
  // Asynchronous: no real-time cadence needed; messages can be ignored or handled if used.
  // Keep state as-is.
  return { state };
};

const asyncTurnMatchSignal: nkruntime.MatchSignalFunction<AsyncTurnState> = function (ctx, logger, nk, dispatcher, tick, state, data) {
  // Optional: allow out-of-band signals (e.g., reservations or debug pings)
  return { state, data: "ok" };
};

const asyncTurnMatchTerminate: nkruntime.MatchTerminateFunction<AsyncTurnState> = function (ctx, logger, nk, dispatcher, tick, state, graceSeconds) {
  return { state };
};
