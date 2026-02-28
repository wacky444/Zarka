/// <reference path="../node_modules/nakama-runtime/index.d.ts" />

import { AsyncTurnState } from "./models/types";
import {
  createMatchRpc,
  getStateRpc,
  joinMatchRpc,
  leaveMatchRpc,
  listMyMatchesRpc,
  removeMatchRpc,
  startMatchRpc,
  submitTurnRpc,
  updateMainActionRpc,
  updateSecondaryActionRpc,
  updateReadyStateRpc,
  updateSettingsRpc,
  getReplayRpc,
  saveChatMessageRpc,
  getChatHistoryRpc,
  getUserAccountRpc,
  updateSkinRpc,
  updateProfileRpc,
} from "./rpc";
import { asyncTurnMatchHandler } from "./match/async_turn";
import { restoreMatchesFromStorage } from "./services/matchRestoration";

export function InitModule(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  initializer: nkruntime.Initializer,
) {
  try {
    initializer.registerRpc("create_match", createMatchRpc);
  } catch (error) {
    logger.error(
      "Failed to register create_match: %s",
      (error && (error as Error).message) || String(error),
    );
  }
  try {
    initializer.registerRpc("submit_turn", submitTurnRpc);
  } catch (error) {
    logger.error(
      "Failed to register submit_turn: %s",
      (error && (error as Error).message) || String(error),
    );
  }
  try {
    initializer.registerRpc("get_state", getStateRpc);
  } catch (error) {
    logger.error(
      "Failed to register get_state: %s",
      (error && (error as Error).message) || String(error),
    );
  }
  try {
    initializer.registerRpc("get_replay", getReplayRpc);
  } catch (error) {
    logger.error(
      "Failed to register get_replay: %s",
      (error && (error as Error).message) || String(error),
    );
  }
  try {
    initializer.registerRpc("save_chat_message", saveChatMessageRpc);
  } catch (error) {
    logger.error(
      "Failed to register save_chat_message: %s",
      (error && (error as Error).message) || String(error),
    );
  }
  try {
    initializer.registerRpc("get_chat_history", getChatHistoryRpc);
  } catch (error) {
    logger.error(
      "Failed to register get_chat_history: %s",
      (error && (error as Error).message) || String(error),
    );
  }
  try {
    initializer.registerRpc("get_user_account", getUserAccountRpc);
  } catch (error) {
    logger.error(
      "Failed to register get_user_account: %s",
      (error && (error as Error).message) || String(error),
    );
  }
  try {
    initializer.registerRpc("update_skin", updateSkinRpc);
  } catch (error) {
    logger.error(
      "Failed to register update_skin: %s",
      (error && (error as Error).message) || String(error),
    );
  }
  try {
    initializer.registerRpc("update_profile", updateProfileRpc);
  } catch (error) {
    logger.error(
      "Failed to register update_profile: %s",
      (error && (error as Error).message) || String(error),
    );
  }
  try {
    initializer.registerRpc("join_match", joinMatchRpc);
  } catch (error) {
    logger.error(
      "Failed to register join_match: %s",
      (error && (error as Error).message) || String(error),
    );
  }
  try {
    initializer.registerRpc("leave_match", leaveMatchRpc);
  } catch (error) {
    logger.error(
      "Failed to register leave_match: %s",
      (error && (error as Error).message) || String(error),
    );
  }
  try {
    initializer.registerRpc("update_settings", updateSettingsRpc);
  } catch (error) {
    logger.error(
      "Failed to register update_settings: %s",
      (error && (error as Error).message) || String(error),
    );
  }
  try {
    initializer.registerRpc("start_match", startMatchRpc);
  } catch (error) {
    logger.error(
      "Failed to register start_match: %s",
      (error && (error as Error).message) || String(error),
    );
  }
  try {
    initializer.registerRpc("list_my_matches", listMyMatchesRpc);
  } catch (error) {
    logger.error(
      "Failed to register list_my_matches: %s",
      (error && (error as Error).message) || String(error),
    );
  }
  try {
    initializer.registerRpc("remove_match", removeMatchRpc);
  } catch (error) {
    logger.error(
      "Failed to register remove_match: %s",
      (error && (error as Error).message) || String(error),
    );
  }
  try {
    initializer.registerRpc("update_main_action", updateMainActionRpc);
  } catch (error) {
    logger.error(
      "Failed to register update_main_action: %s",
      (error && (error as Error).message) || String(error),
    );
  }
  try {
    initializer.registerRpc(
      "update_secondary_action",
      updateSecondaryActionRpc,
    );
  } catch (error) {
    logger.error(
      "Failed to register update_secondary_action: %s",
      (error && (error as Error).message) || String(error),
    );
  }
  try {
    initializer.registerRpc("update_ready_state", updateReadyStateRpc);
  } catch (error) {
    logger.error(
      "Failed to register update_ready_state: %s",
      (error && (error as Error).message) || String(error),
    );
  }
  try {
    initializer.registerMatch<AsyncTurnState>(
      "async_turn",
      asyncTurnMatchHandler,
    );
  } catch (error) {
    logger.error(
      "Failed to register match handler async_turn: %s",
      (error && (error as Error).message) || String(error),
    );
  }

  logger.info("TypeScript async_turn module loaded.");

  try {
    const restoredCount = restoreMatchesFromStorage(ctx, logger, nk);
    logger.info(
      "Match restoration completed: %d matches restored",
      restoredCount,
    );
  } catch (error) {
    logger.error(
      "Failed to restore matches from storage: %s",
      (error && (error as Error).message) || String(error),
    );
  }
}

const globalScope = globalThis as {
  InitModule?: typeof InitModule;
  module?: { exports?: { InitModule?: typeof InitModule } };
  exports?: { InitModule?: typeof InitModule };
};

const exportsTarget =
  globalScope.module?.exports ??
  globalScope.exports ??
  (globalScope.exports = {});

if (exportsTarget.InitModule !== InitModule) {
  try {
    exportsTarget.InitModule = InitModule;
  } catch (_) {}
}

globalScope.module = globalScope.module ?? { exports: exportsTarget };
globalScope.module.exports = exportsTarget;

if (globalScope.InitModule !== InitModule) {
  try {
    globalScope.InitModule = InitModule;
  } catch (_) {}
}

export default InitModule;
