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

  // There is no nk.uuidV4 in TS runtime; use nk.uuidV4 if present else fallback
  // In JS runtime use nk.uuidv4(). Docs expose nk.uuidv4().
  // Some versions expose nk.uuidV4; try both.
  // @ts-ignore
  const uuidFn = (nk as any).uuidv4 || (nk as any).uuidV4;
  const matchId = uuidFn ? uuidFn() : ("match-" + Date.now() + Math.random().toString(16).slice(2));

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
  logger.info('TypeScript async_turn module loaded.');
}

// Reference InitModule to avoid it getting removed by bundlers.
!InitModule && InitModule.bind(null);
