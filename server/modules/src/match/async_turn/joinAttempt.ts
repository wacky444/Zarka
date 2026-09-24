/// <reference path="../../../node_modules/nakama-runtime/index.d.ts" />

import { TUTORIAL_MATCH_METADATA_KEY } from "@shared";
import type { AsyncTurnState } from "../../models/types";
import { createStorageService } from "../../services/storageService";
import { hasTutorialCompleted } from "../../utils/tutorialProfile";

export const asyncTurnMatchJoinAttempt: nkruntime.MatchJoinAttemptFunction<AsyncTurnState> =
  function (ctx, logger, nk, dispatcher, tick, state, presence) {
    const match = createStorageService(nk).getMatch(state.game_id)?.match;
    if (match?.metadata?.[TUTORIAL_MATCH_METADATA_KEY]) {
      if (
        !Array.isArray(match.players) ||
        match.players.indexOf(presence.userId) === -1
      ) {
        return {
          state,
          accept: false,
          rejectMessage: "not_in_tutorial_match"
        };
      }
    } else if (!hasTutorialCompleted(nk, presence.userId, logger)) {
      return {
        state,
        accept: false,
        rejectMessage: "tutorial_incomplete"
      };
    }

    const alreadyJoined = !!state.players[presence.userId];
    const capacity =
      Object.keys(state.players).length + (alreadyJoined ? 0 : 1);
    const accept = capacity <= state.size;
    return accept
      ? { state, accept }
      : { state, accept: false, rejectMessage: "match_full" };
  };
