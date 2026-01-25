/// <reference path="../../../node_modules/nakama-runtime/index.d.ts" />

import { DEFAULT_MATCH_NAME } from "../../constants";
import {
  DEFAULT_REPLAY_VIEW_DISTANCE,
  OPCODE_MATCH_REMOVED,
  OPCODE_MATCH_ENDED,
  OPCODE_SETTINGS_UPDATE,
  OPCODE_TURN_ADVANCED,
} from "@shared";
import { AsyncTurnState } from "../../models/types";
import { buildMatchLabel } from "../../utils/label";
import { normalizeMatchName } from "../../utils/normalize";
import { clampNumber, validateTime } from "../../utils/validation";
import { tailorReplayEvents } from "../replay/tailorReplay";
import {
  tailorMapForCharacter,
  tailorMatchItemsForCharacter,
} from "../../utils/matchView";

export const asyncTurnMatchSignal: nkruntime.MatchSignalFunction<AsyncTurnState> =
  function (ctx, logger, nk, dispatcher, tick, state, data) {
    try {
      const msg = typeof data === "string" ? JSON.parse(data) : data;
      if (msg && msg.type === "update_settings") {
        const ns = clampNumber(msg.size, 1, 100);
        const nc = clampNumber(msg.cols, 1, 100);
        const nr = clampNumber(msg.rows, 1, 100);
        const nrt = validateTime(msg.roundTime);
        const nas =
          typeof msg.autoSkip === "boolean" ? msg.autoSkip : undefined;
        const nbp = clampNumber(msg.botPlayers, 0, 10);
        const nn =
          typeof msg.name === "string"
            ? normalizeMatchName(msg.name, state.name ?? DEFAULT_MATCH_NAME)
            : undefined;

        if (typeof ns === "number") state.size = ns;
        if (typeof nc === "number") state.cols = nc;
        if (typeof nr === "number") state.rows = nr;
        if (typeof nrt === "string") state.roundTime = nrt;
        if (typeof nas === "boolean") state.autoSkip = nas;
        if (typeof nbp === "number") state.botPlayers = nbp;
        if (typeof nn === "string") state.name = nn;

        try {
          const label = buildMatchLabel({
            name: state.name,
            size: state.size,
            players: state.order.length,
            started: state.started,
            creator: state.creator,
          });
          dispatcher.matchLabelUpdate(label);
        } catch {}

        try {
          const payload = JSON.stringify({
            size: state.size,
            cols: state.cols,
            rows: state.rows,
            roundTime: state.roundTime,
            autoSkip: state.autoSkip,
            botPlayers: state.botPlayers,
            name: state.name,
            started: state.started,
            players: state.order,
          });
          dispatcher.broadcastMessage(
            OPCODE_SETTINGS_UPDATE,
            payload,
            null,
            null,
            true,
          );
        } catch {}
      } else if (msg && msg.type === "start_match") {
        if (!state.started) {
          state.started = true;
          try {
            const label = buildMatchLabel({
              name: state.name,
              size: state.size,
              players: state.order.length,
              started: state.started,
              creator: state.creator,
            });
            dispatcher.matchLabelUpdate(label);
          } catch {}
          try {
            const payload = JSON.stringify({
              size: state.size,
              cols: state.cols,
              rows: state.rows,
              roundTime: state.roundTime,
              autoSkip: state.autoSkip,
              botPlayers: state.botPlayers,
              name: state.name,
              started: state.started,
              players: state.order,
            });
            dispatcher.broadcastMessage(
              OPCODE_SETTINGS_UPDATE,
              payload,
              null,
              null,
              true,
            );
          } catch {}
        }
      } else if (msg && msg.type === "sync_players") {
        if (Array.isArray(msg.players)) {
          const nextOrder: string[] = [];
          for (const entry of msg.players) {
            if (typeof entry !== "string") {
              continue;
            }
            const trimmed = entry.trim();
            if (!trimmed.length) {
              continue;
            }
            if (nextOrder.indexOf(trimmed) !== -1) {
              continue;
            }
            nextOrder.push(trimmed);
          }
          state.order = nextOrder;
        } else {
          state.order = [];
        }
        if (typeof msg.size === "number") {
          state.size = msg.size;
        }
        if (typeof msg.name === "string") {
          state.name = normalizeMatchName(
            msg.name,
            state.name ?? DEFAULT_MATCH_NAME,
          );
        }
        if (typeof msg.started === "boolean") {
          state.started = msg.started;
        }
        try {
          const label = buildMatchLabel({
            name: state.name,
            size: state.size,
            players: state.order.length,
            started: state.started,
            creator: state.creator,
          });
          dispatcher.matchLabelUpdate(label);
        } catch {}
        try {
          const payload = JSON.stringify({
            size: state.size,
            cols: state.cols,
            rows: state.rows,
            roundTime: state.roundTime,
            autoSkip: state.autoSkip,
            botPlayers: state.botPlayers,
            name: state.name,
            started: state.started,
            players: state.order,
          });
          dispatcher.broadcastMessage(
            OPCODE_SETTINGS_UPDATE,
            payload,
            null,
            null,
            true,
          );
        } catch {}
      } else if (msg && msg.type === "turn_advanced") {
        try {
          const viewDistance =
            typeof msg.viewDistance === "number"
              ? msg.viewDistance
              : DEFAULT_REPLAY_VIEW_DISTANCE;
          const events = Array.isArray(msg.events) ? msg.events : [];
          const payloadBase = {
            match_id: ctx.matchId,
            turn: msg.turn,
            readyStates: msg.readyStates,
            playerCharacters: msg.playerCharacters,
            advanced: true,
            viewDistance,
          };
          const entries: Array<[string, nkruntime.Presence]> = [];
          const playerMap = state.players ?? {};
          for (const playerId in playerMap) {
            if (!Object.prototype.hasOwnProperty.call(playerMap, playerId)) {
              continue;
            }
            const presence = playerMap[playerId];
            if (presence) {
              entries.push([playerId, presence]);
            }
          }
          if (entries.length === 0) {
            const payload = JSON.stringify({
              ...payloadBase,
              replay: events,
              map: tailorMapForCharacter(msg.map, null),
              items: tailorMatchItemsForCharacter(msg.items, null),
            });
            dispatcher.broadcastMessage(
              OPCODE_TURN_ADVANCED,
              payload,
              null,
              null,
              true,
            );
          } else {
            for (const [playerId, presence] of entries) {
              const tailored = tailorReplayEvents(
                events,
                playerId,
                msg.playerCharacters,
                viewDistance,
              );
              const payload = JSON.stringify({
                ...payloadBase,
                replay: tailored,
                map: tailorMapForCharacter(
                  msg.map,
                  msg.playerCharacters?.[playerId] ?? null,
                ),
                items: tailorMatchItemsForCharacter(
                  msg.items,
                  msg.playerCharacters?.[playerId] ?? null,
                ),
              });
              dispatcher.broadcastMessage(
                OPCODE_TURN_ADVANCED,
                payload,
                [presence],
                null,
                true,
              );
            }
          }
        } catch {}
      } else if (msg && msg.type === "match_removed") {
        try {
          const payload = JSON.stringify({ match_removed: true });
          dispatcher.broadcastMessage(
            OPCODE_MATCH_REMOVED,
            payload,
            null,
            null,
            true,
          );
        } catch {}
        return null;
      } else if (msg && msg.type === "match_ended") {
        try {
          const payload = JSON.stringify({
            match_id: msg.match_id ?? ctx.matchId,
            winnerId:
              typeof msg.winnerId === "string" ? msg.winnerId : undefined,
            reason: msg.reason === "all_dead" ? "all_dead" : "last_alive",
          });
          dispatcher.broadcastMessage(
            OPCODE_MATCH_ENDED,
            payload,
            null,
            null,
            true,
          );
        } catch {}
      }
    } catch (e) {
      logger.warn("matchSignal parse error: %v", e);
    }
    return { state, data: "ok" };
  };
