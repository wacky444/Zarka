import { asyncTurnMatchInit } from "./init";
import { asyncTurnMatchJoinAttempt } from "./joinAttempt";
import { asyncTurnMatchJoin } from "./join";
import { asyncTurnMatchLeave } from "./leave";
import { asyncTurnMatchLoop } from "./loop";
import { asyncTurnMatchSignal } from "./signal";
import { asyncTurnMatchTerminate } from "./terminate";

export const asyncTurnMatchHandler = {
  matchInit: asyncTurnMatchInit,
  matchJoinAttempt: asyncTurnMatchJoinAttempt,
  matchJoin: asyncTurnMatchJoin,
  matchLeave: asyncTurnMatchLeave,
  matchLoop: asyncTurnMatchLoop,
  matchSignal: asyncTurnMatchSignal,
  matchTerminate: asyncTurnMatchTerminate,
};
