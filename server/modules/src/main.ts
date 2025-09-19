/// <reference path="../node_modules/nakama-runtime/index.d.ts" />
const MATCH_COLLECTION = "async_turn_matches";
const TURN_COLLECTION = "async_turn_turns";
const MATCH_KEY_PREFIX = "match_";
const SERVER_USER_ID = "00000000-0000-0000-0000-000000000000";
// Match opcodes for realtime messages
const OPCODE_SETTINGS_UPDATE = 100;

// Types of objects we store
interface MatchRecord {
  match_id: string;
  players: string[];
  size: number;
  cols?: number;
  rows?: number;
  created_at: number;
  current_turn: number;
  creator?: string;
}

interface TurnRecord {
  match_id: string;
  turn: number;
  player: string;
  move: any;
  created_at: number;
}

// RPC: create_match
function create_match(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  if (!ctx || !ctx.userId) {
    throw {
      message: "No user context",
      code: nkruntime.Codes.INVALID_ARGUMENT,
    } as nkruntime.Error;
  }
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
  const params: { [key: string]: string } = {
    size: String(size),
    creator: ctx.userId,
  };
  const matchId = nk.matchCreate("async_turn", params);

  const record: MatchRecord = {
    match_id: matchId,
    players: [],
    size: size,
    created_at: Math.floor(Date.now() / 1000),
    current_turn: 0,
    creator: ctx.userId,
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
  const response: import("@shared").CreateMatchPayload = {
    match_id: matchId,
    size,
  };
  return JSON.stringify(response);
}

// RPC: update_settings
function update_settings(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  if (!ctx || !ctx.userId) {
    throw {
      message: "No user context",
      code: nkruntime.Codes.INVALID_ARGUMENT,
    } as nkruntime.Error;
  }
  if (!payload || payload === "") {
    throw {
      message: "Missing payload",
      code: nkruntime.Codes.INVALID_ARGUMENT,
    } as nkruntime.Error;
  }
  let json: any;
  try {
    json = JSON.parse(payload);
  } catch {
    throw {
      message: "bad_json",
      code: nkruntime.Codes.INVALID_ARGUMENT,
    } as nkruntime.Error;
  }
  const matchId: string = json.match_id;
  const settings = json.settings || {};
  if (!matchId) {
    throw {
      message: "match_id required",
      code: nkruntime.Codes.INVALID_ARGUMENT,
    } as nkruntime.Error;
  }

  const matchKey = MATCH_KEY_PREFIX + matchId;
  const reads = nk.storageRead([
    { collection: MATCH_COLLECTION, key: matchKey, userId: SERVER_USER_ID },
  ]);
  if (!reads || reads.length !== 1) {
    throw {
      message: "not_found",
      code: nkruntime.Codes.NOT_FOUND,
    } as nkruntime.Error;
  }
  const read = reads[0];
  const match = read.value as MatchRecord;

  // Only allow the match creator to update settings
  const isCreator = !!match.creator && match.creator === ctx.userId;
  if (!isCreator) {
    throw {
      message: "not_creator",
      code: nkruntime.Codes.PERMISSION_DENIED,
    } as nkruntime.Error;
  }

  // Clamp values per request: min 1, max 100
  const clamp = (n: any, min = 1, max = 100) => {
    const v = parseInt(String(n ?? 0), 10);
    if (isNaN(v)) return undefined;
    return Math.max(min, Math.min(max, v));
  };

  const newSize = clamp(settings.players);
  const newCols = clamp(settings.cols);
  const newRows = clamp(settings.rows);
  if (typeof newSize === "number") match.size = newSize;
  if (typeof newCols === "number") match.cols = newCols;
  if (typeof newRows === "number") match.rows = newRows;

  try {
    nk.storageWrite([
      {
        collection: MATCH_COLLECTION,
        key: matchKey,
        userId: SERVER_USER_ID,
        value: match,
        permissionRead: 2,
        permissionWrite: 0,
        version: read.version,
      },
    ]);
    // Also notify the authoritative match, if active, so in-memory state reflects changes
    try {
      nk.matchSignal(
        matchId,
        JSON.stringify({
          type: "update_settings",
          size: match.size,
          cols: match.cols,
          rows: match.rows,
        })
      );
    } catch {}
  } catch (e) {
    throw {
      message: "storage_write_failed",
      code: nkruntime.Codes.INTERNAL,
    } as nkruntime.Error;
  }

  const response5: import("@shared").UpdateSettingsPayload = {
    ok: true,
    match_id: matchId,
    size: match.size,
    cols: match.cols,
    rows: match.rows,
  };
  return JSON.stringify(response5);
}

// RPC: submit_turn
function submit_turn(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  if (!ctx || !ctx.userId) {
    throw {
      message: "No user context",
      code: nkruntime.Codes.INVALID_ARGUMENT,
    } as nkruntime.Error;
  }
  if (!payload || payload === "") {
    throw {
      message: "Missing payload",
      code: nkruntime.Codes.INVALID_ARGUMENT,
    } as nkruntime.Error;
  }
  let json: any;
  try {
    json = JSON.parse(payload);
  } catch {
    throw {
      message: "bad_json",
      code: nkruntime.Codes.INVALID_ARGUMENT,
    } as nkruntime.Error;
  }
  if (!json.match_id) {
    throw {
      message: "match_id required",
      code: nkruntime.Codes.INVALID_ARGUMENT,
    } as nkruntime.Error;
  }
  const matchKey = MATCH_KEY_PREFIX + json.match_id;

  const reads = nk.storageRead([
    { collection: MATCH_COLLECTION, key: matchKey, userId: SERVER_USER_ID },
  ]);
  if (!reads || reads.length !== 1) {
    throw {
      message: "Match not found",
      code: nkruntime.Codes.NOT_FOUND,
    } as nkruntime.Error;
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

  const response2: import("@shared").SubmitTurnPayload = {
    ok: true,
    turn: match.current_turn,
  };
  return JSON.stringify(response2);
}

// RPC: get_state
function get_state(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  if (!payload || payload === "") {
    return JSON.stringify({ error: "missing_payload" });
  }
  let json: any;
  try {
    json = JSON.parse(payload);
  } catch {
    return JSON.stringify({ error: "bad_json" });
  }
  if (!json.match_id || json.match_id === "") {
    return JSON.stringify({ error: "match_id_required" });
  }
  const matchKey = MATCH_KEY_PREFIX + json.match_id;
  const records = nk.storageRead([
    { collection: MATCH_COLLECTION, key: matchKey, userId: SERVER_USER_ID },
  ]);
  if (!records || records.length === 0) {
    return JSON.stringify({ error: "not_found" });
  }
  const match = records[0].value as MatchRecord;

  // Fetch last 50 turns
  const limit = 50;
  const start = Math.max(1, (match.current_turn || 0) - limit + 1);
  const turnReads: nkruntime.StorageReadRequest[] = [];
  for (let i = start; i <= match.current_turn; i++) {
    turnReads.push({
      collection: TURN_COLLECTION,
      key: `${i}:${json.match_id}`,
      userId: SERVER_USER_ID,
    });
  }
  const turnResults = turnReads.length ? nk.storageRead(turnReads) : [];
  const turns: TurnRecord[] = [];
  for (const r of turnResults) {
    if (r && r.value) turns.push(r.value as TurnRecord);
  }
  const response3: import("@shared").GetStatePayload = {
    match,
    turns,
  };
  return JSON.stringify(response3);
}

// RPC: join_match
function join_match(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  if (!ctx || !ctx.userId) {
    throw {
      message: "No user context",
      code: nkruntime.Codes.INVALID_ARGUMENT,
    } as nkruntime.Error;
  }
  if (!payload || payload === "") {
    throw {
      message: "Missing payload",
      code: nkruntime.Codes.INVALID_ARGUMENT,
    } as nkruntime.Error;
  }
  let json: any;
  try {
    json = JSON.parse(payload);
  } catch {
    throw {
      message: "bad_json",
      code: nkruntime.Codes.INVALID_ARGUMENT,
    } as nkruntime.Error;
  }
  const matchId: string = json.match_id;
  if (!matchId || matchId === "") {
    throw {
      message: "match_id required",
      code: nkruntime.Codes.INVALID_ARGUMENT,
    } as nkruntime.Error;
  }

  const matchKey = MATCH_KEY_PREFIX + matchId;
  const reads = nk.storageRead([
    { collection: MATCH_COLLECTION, key: matchKey, userId: SERVER_USER_ID },
  ]);
  if (!reads || reads.length !== 1) {
    throw {
      message: "not_found",
      code: nkruntime.Codes.NOT_FOUND,
    } as nkruntime.Error;
  }
  const read = reads[0];
  const match = read.value as MatchRecord;

  let joinedNow = false;
  if (match.players.indexOf(ctx.userId) === -1) {
    // capacity check
    const current = match.players.length;
    if (current >= (match.size || 2)) {
      throw {
        message: "match_full",
        code: nkruntime.Codes.FAILED_PRECONDITION,
      } as nkruntime.Error;
    }
    match.players.push(ctx.userId);
    joinedNow = true;

    nk.storageWrite([
      {
        collection: MATCH_COLLECTION,
        key: matchKey,
        userId: SERVER_USER_ID,
        value: match,
        permissionRead: 2,
        permissionWrite: 0,
        version: read.version, // OCC
      },
    ]);
  }

  const response4: import("@shared").JoinMatchPayload = {
    ok: true,
    match_id: matchId,
    size: match.size,
    players: match.players,
    joined: joinedNow,
    // creator info is stored in storage; clients can fetch via get_state or label
  };
  return JSON.stringify(response4);
}

// RPC: leave_match

function leave_match(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  if (!ctx || !ctx.userId) {
    throw {
      message: "No user context",
      code: nkruntime.Codes.INVALID_ARGUMENT,
    } as nkruntime.Error;
  }
  if (!payload || payload === "") {
    throw {
      message: "Missing payload",
      code: nkruntime.Codes.INVALID_ARGUMENT,
    } as nkruntime.Error;
  }
  let json: any;
  try {
    json = JSON.parse(payload);
  } catch {
    throw {
      message: "bad_json",
      code: nkruntime.Codes.INVALID_ARGUMENT,
    } as nkruntime.Error;
  }
  const matchId: string = json.match_id;
  if (!matchId || matchId === "") {
    throw {
      message: "match_id required",
      code: nkruntime.Codes.INVALID_ARGUMENT,
    } as nkruntime.Error;
  }

  const matchKey = MATCH_KEY_PREFIX + matchId;
  const reads = nk.storageRead([
    { collection: MATCH_COLLECTION, key: matchKey, userId: SERVER_USER_ID },
  ]);
  if (!reads || reads.length !== 1) {
    throw {
      message: "not_found",
      code: nkruntime.Codes.NOT_FOUND,
    } as nkruntime.Error;
  }
  const read = reads[0];
  const match = read.value as MatchRecord;

  const idx = match.players.indexOf(ctx.userId);
  const wasInMatch = idx !== -1;
  if (wasInMatch) {
    match.players.splice(idx, 1);
    try {
      nk.storageWrite([
        {
          collection: MATCH_COLLECTION,
          key: matchKey,
          userId: SERVER_USER_ID,
          value: match,
          permissionRead: 2,
          permissionWrite: 0,
          version: read.version, // OCC
        },
      ]);
    } catch (e) {
      throw {
        message: "storage_write_failed",
        code: nkruntime.Codes.INTERNAL,
      } as nkruntime.Error;
    }
  }

  const response: import("@shared").LeaveMatchPayload = {
    ok: true,
    match_id: matchId,
    players: match.players,
    left: wasInMatch,
  };
  return JSON.stringify(response);
}

// RPC: list_my_matches
function list_my_matches(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string
): string {
  if (!ctx || !ctx.userId) {
    throw {
      message: "No user context",
      code: nkruntime.Codes.INVALID_ARGUMENT,
    } as nkruntime.Error;
  }

  try {
    // List all matches in storage where the current user is in players array
    const storageObjects = nk.storageList(
      ctx.userId, // Use current user as the storage user (this will only find public read records)
      MATCH_COLLECTION,
      100, // limit
      ""   // cursor
    );

    const myMatches: Array<{
      match_id: string;
      size: number;
      players: string[];
      current_turn: number;
      created_at: number;
      creator?: string;
      cols?: number;
      rows?: number;
    }> = [];

    // Since storage records are server-owned, we need to read them differently
    // Let's try using storageRead with pattern matching or iterate through known matches
    // For now, let's use a simpler approach: search through available storage
    
    // Actually, let's read from server storage and filter
    const allMatchObjects = nk.storageList(
      SERVER_USER_ID,
      MATCH_COLLECTION, 
      100, // limit
      ""   // cursor
    );

    if (allMatchObjects && allMatchObjects.objects) {
      for (const obj of allMatchObjects.objects) {
        if (obj.value) {
          const match = obj.value as MatchRecord;
          // Check if current user is in players array
          if (match.players && match.players.indexOf(ctx.userId) !== -1) {
            myMatches.push({
              match_id: match.match_id,
              size: match.size,
              players: match.players,
              current_turn: match.current_turn,
              created_at: match.created_at,
              creator: match.creator,
              cols: match.cols,
              rows: match.rows,
            });
          }
        }
      }
    }

    const response: import("@shared").ListMyMatchesPayload = {
      ok: true,
      matches: myMatches,
    };
    return JSON.stringify(response);
  } catch (e) {
    logger.error("Error in list_my_matches: %s", (e as Error).message || String(e));
    const response: import("@shared").ListMyMatchesPayload = {
      ok: false,
      error: (e as Error).message || String(e),
    };
    return JSON.stringify(response);
  }
}

function InitModule(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  initializer: nkruntime.Initializer
) {
  try {
    initializer.registerRpc("create_match", create_match);
  } catch (error) {
    logger.error(
      "Failed to register create_match: %s",
      (error && (error as Error).message) || String(error)
    );
  }
  try {
    initializer.registerRpc("submit_turn", submit_turn);
  } catch (error) {
    logger.error(
      "Failed to register submit_turn: %s",
      (error && (error as Error).message) || String(error)
    );
  }
  try {
    initializer.registerRpc("get_state", get_state);
  } catch (error) {
    logger.error(
      "Failed to register get_state: %s",
      (error && (error as Error).message) || String(error)
    );
  }
  try {
    initializer.registerRpc("join_match", join_match);
  } catch (error) {
    logger.error(
      "Failed to register join_match: %s",
      (error && (error as Error).message) || String(error)
    );
  }
  try {
    initializer.registerRpc("leave_match", leave_match);
  } catch (error) {
    logger.error(
      "Failed to register leave_match: %s",
      (error && (error as Error).message) || String(error)
    );
  }
  try {
    initializer.registerRpc("update_settings", update_settings);
  } catch (error) {
    logger.error(
      "Failed to register update_settings: %s",
      (error && (error as Error).message) || String(error)
    );
  }
  try {
    initializer.registerRpc("list_my_matches", list_my_matches);
  } catch (error) {
    logger.error(
      "Failed to register list_my_matches: %s",
      (error && (error as Error).message) || String(error)
    );
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
    logger.error(
      "Failed to register match handler async_turn: %s",
      (error && (error as Error).message) || String(error)
    );
  }
  logger.info("TypeScript async_turn module loaded.");
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
  cols?: number;
  rows?: number;
  current_turn: number;
  started: boolean;
  creator?: string;
};

const asyncTurnMatchInit: nkruntime.MatchInitFunction<AsyncTurnState> =
  function (ctx, logger, nk, params) {
    const sizeStr = params && params["size"];
    const size = Math.max(2, Math.min(8, parseInt(sizeStr || "2", 10) || 2));
    const creator = params && params["creator"]; // optional

    const state: AsyncTurnState = {
      players: {},
      order: [],
      size,
      cols: undefined,
      rows: undefined,
      current_turn: 0,
      started: false,
      creator: typeof creator === "string" ? creator : undefined,
    };

    // Include some info in label for optional listing/filtering.
    const label = JSON.stringify({
      mode: "async",
      size: String(size),
      players: 0,
      started: false,
      creator: state.creator,
    });
    // Asynchronous turn-based can use a low tick rate.
    const tickRate = 1;
    return { state, tickRate, label };
  };

const asyncTurnMatchJoinAttempt: nkruntime.MatchJoinAttemptFunction<AsyncTurnState> =
  function (ctx, logger, nk, dispatcher, tick, state, presence, metadata) {
    const alreadyJoined = !!state.players[presence.userId];
    const capacity =
      Object.keys(state.players).length + (alreadyJoined ? 0 : 1);
    const accept = capacity <= state.size;
    return accept
      ? { state, accept }
      : { state, accept: false, rejectMessage: "match_full" };
  };

const asyncTurnMatchJoin: nkruntime.MatchJoinFunction<AsyncTurnState> =
  function (ctx, logger, nk, dispatcher, tick, state, presences) {
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
      const label = JSON.stringify({
        mode: "async",
        size: String(state.size),
        players: playerCount,
        started: state.started,
      });
      dispatcher.matchLabelUpdate(label);
    } catch (e) {
      // ignore label update errors
    }
    // Send current settings to the newly joined presences so their UI updates immediately.
    try {
      const payload = JSON.stringify({
        size: state.size,
        cols: state.cols,
        rows: state.rows,
        started: state.started,
      });
      dispatcher.broadcastMessage(
        OPCODE_SETTINGS_UPDATE,
        payload,
        presences, // target only newly joined
        null,
        true
      );
    } catch {}
    return { state };
  };

const asyncTurnMatchLeave: nkruntime.MatchLeaveFunction<AsyncTurnState> =
  function (ctx, logger, nk, dispatcher, tick, state, presences) {
    for (const p of presences) {
      if (state.players[p.userId]) {
        delete state.players[p.userId];
        const idx = state.order.indexOf(p.userId);
        if (idx !== -1) state.order.splice(idx, 1);
      }
    }
    const playerCount = Object.keys(state.players).length;
    try {
      const label = JSON.stringify({
        mode: "async",
        size: String(state.size),
        players: playerCount,
        started: state.started,
      });
      dispatcher.matchLabelUpdate(label);
    } catch {}
    // End match when empty
    if (playerCount === 0) {
      return null;
    }
    return { state };
  };

const asyncTurnMatchLoop: nkruntime.MatchLoopFunction<AsyncTurnState> =
  function (ctx, logger, nk, dispatcher, tick, state, messages) {
    // Asynchronous: no real-time cadence needed; messages can be ignored or handled if used.
    // Keep state as-is.
    return { state };
  };

const asyncTurnMatchSignal: nkruntime.MatchSignalFunction<AsyncTurnState> =
  function (ctx, logger, nk, dispatcher, tick, state, data) {
    try {
      const msg = typeof data === "string" ? JSON.parse(data) : data;
      if (msg && msg.type === "update_settings") {
        const clamp = (n: any, min = 1, max = 100) => {
          const v = parseInt(String(n ?? 0), 10);
          if (isNaN(v)) return undefined;
          return Math.max(min, Math.min(max, v));
        };
        const ns = clamp(msg.size);
        const nc = clamp(msg.cols);
        const nr = clamp(msg.rows);
        if (typeof ns === "number") state.size = ns;
        if (typeof nc === "number") state.cols = nc;
        if (typeof nr === "number") state.rows = nr;
        // refresh label
        try {
          const label = JSON.stringify({
            mode: "async",
            size: String(state.size),
            players: Object.keys(state.players).length,
            started: state.started,
          });
          dispatcher.matchLabelUpdate(label);
        } catch {}
        // Broadcast the updated settings to all connected presences in real time
        try {
          const payload = JSON.stringify({
            size: state.size,
            cols: state.cols,
            rows: state.rows,
            started: state.started,
          });
          dispatcher.broadcastMessage(
            OPCODE_SETTINGS_UPDATE,
            payload,
            null, // null => everyone in the match
            null,
            true
          );
        } catch {}
      }
    } catch (e) {
      logger.warn("matchSignal parse error: %v", e);
    }
    return { state, data: "ok" };
  };

const asyncTurnMatchTerminate: nkruntime.MatchTerminateFunction<AsyncTurnState> =
  function (ctx, logger, nk, dispatcher, tick, state, graceSeconds) {
    return { state };
  };
