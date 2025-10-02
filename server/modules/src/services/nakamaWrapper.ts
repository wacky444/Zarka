/// <reference path="../../node_modules/nakama-runtime/index.d.ts" />

export interface NakamaWrapper {
  storageRead: nkruntime.Nakama["storageRead"];
  storageWrite: nkruntime.Nakama["storageWrite"];
  storageList: nkruntime.Nakama["storageList"];
  storageDelete: nkruntime.Nakama["storageDelete"];
  matchCreate: nkruntime.Nakama["matchCreate"];
  matchSignal: nkruntime.Nakama["matchSignal"];
}

export function createNakamaWrapper(nk: nkruntime.Nakama): NakamaWrapper {
  return {
    storageRead: nk.storageRead.bind(nk),
    storageWrite: nk.storageWrite.bind(nk),
    storageList: nk.storageList.bind(nk),
    storageDelete: nk.storageDelete.bind(nk),
    matchCreate: nk.matchCreate.bind(nk),
    matchSignal: nk.matchSignal.bind(nk),
  };
}
