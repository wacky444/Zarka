/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

export function makeNakamaError(
  message: string,
  code: nkruntime.Codes
): nkruntime.Error {
  return {
    message,
    code,
  } as nkruntime.Error;
}
