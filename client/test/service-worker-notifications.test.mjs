import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../public/service-worker.js", import.meta.url), "utf8");
const scope = "https://example.test/Zarka/";

function loadWorker() {
  const listeners = new Map();
  const notifications = [];
  const self = {
    registration: {
      scope,
      showNotification: async (title, options) => {
        notifications.push({ title, options });
      }
    },
    addEventListener: (type, listener) => listeners.set(type, listener),
    clients: {
      matchAll: async () => [],
      openWindow: async (url) => url
    }
  };
  runInNewContext(source, { self, URL, Number, Promise });
  return { listeners, notifications };
}

async function dispatchPush(worker, payload) {
  let pending;
  worker.listeners.get("push")({
    data: { json: () => payload },
    waitUntil: (promise) => { pending = promise; }
  });
  await pending;
}

test("ranked-match push is localized, minimal, and opens match refresh route", async () => {
  const worker = loadWorker();
  await dispatchPush(worker, {
    event: "ranked_match_started",
    matchId: "ranked_assignment-1",
    locale: "en"
  });
  await dispatchPush(worker, {
    event: "ranked_match_started",
    matchId: "ranked_assignment-2",
    locale: "es"
  });

  assert.equal(worker.notifications[0].title, "Zarka: ranked match started");
  assert.equal(worker.notifications[0].options.body, "Your ranked match is ready.");
  assert.equal(worker.notifications[1].title, "Zarka: partida clasificatoria iniciada");
  assert.equal(worker.notifications[1].options.body, "Tu partida clasificatoria ya está lista.");
  assert.equal(worker.notifications[0].options.tag, "zarka-ranked_assignment-1-ranked-start");
  assert.equal(
    worker.notifications[0].options.data.url,
    "https://example.test/Zarka/?refreshMatches=1"
  );

  let clickPromise;
  worker.listeners.get("notificationclick")({
    notification: { close: () => undefined },
    waitUntil: (promise) => { clickPromise = promise; }
  });
  await clickPromise;
});

test("turn notifications keep existing English and Spanish copy", async () => {
  const worker = loadWorker();
  await dispatchPush(worker, {
    event: "turn_advanced",
    matchId: "match-1",
    turn: 4,
    locale: "en"
  });
  await dispatchPush(worker, {
    event: "turn_advanced",
    matchId: "match-2",
    turn: 5,
    locale: "es"
  });

  assert.equal(worker.notifications[0].title, "Zarka: new turn");
  assert.equal(worker.notifications[0].options.body, "Turn 4 advanced.");
  assert.equal(worker.notifications[1].title, "Zarka: nuevo turno");
  assert.equal(worker.notifications[1].options.body, "Turno 5 avanzado.");
});
