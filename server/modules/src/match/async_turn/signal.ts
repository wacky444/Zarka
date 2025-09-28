/// <reference path="../../../node_modules/nakama-runtime/index.d.ts" />

import { DEFAULT_MATCH_NAME, OPCODE_SETTINGS_UPDATE } from "../../constants";
import { AsyncTurnState } from "../../models/types";
import { buildMatchLabel } from "../../utils/label";
import { normalizeMatchName } from "../../utils/normalize";
import { clampNumber, validateTime } from "../../utils/validation";

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
            players: Object.keys(state.players).length,
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
          });
          dispatcher.broadcastMessage(
            OPCODE_SETTINGS_UPDATE,
            payload,
            null,
            null,
            true
          );
        } catch {}
      } else if (msg && msg.type === "start_match") {
        if (!state.started) {
          state.started = true;
          try {
            const label = buildMatchLabel({
              name: state.name,
              size: state.size,
              players: Object.keys(state.players).length,
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
            });
            dispatcher.broadcastMessage(
              OPCODE_SETTINGS_UPDATE,
              payload,
              null,
              null,
              true
            );
          } catch {}
        }
      }
    } catch (e) {
      logger.warn("matchSignal parse error: %v", e);
    }
    return { state, data: "ok" };
  };
