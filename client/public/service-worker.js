self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const matchId =
    payload && typeof payload.matchId === "string" ? payload.matchId : "";
  const turn = payload && Number.isSafeInteger(payload.turn) ? payload.turn : null;
  const spanish = payload && payload.locale === "es";
  const title = spanish ? "Zarka: nuevo turno" : "Zarka: new turn";
  const body = turn
    ? spanish
      ? `Turno ${turn} avanzado.`
      : `Turn ${turn} advanced.`
    : spanish
      ? "Avanzó un turno de la partida."
      : "A match turn advanced.";
  const options = {
    body,
    lang: spanish ? "es" : "en",
    icon: new URL("zarka-icon-512.png", self.registration.scope).href,
    badge: new URL("notification-badge.svg", self.registration.scope).href,
    tag: matchId ? `zarka-${matchId}-${turn ?? "update"}` : "zarka-turn",
    renotify: false,
    data: {
      url: new URL("./?refreshMatches=1", self.registration.scope).href
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL("./?refreshMatches=1", self.registration.scope);
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(
      async (windowClients) => {
        for (const client of windowClients) {
          const clientUrl = new URL(client.url);
          if (
            clientUrl.origin === targetUrl.origin &&
            clientUrl.pathname.startsWith(targetUrl.pathname)
          ) {
            const navigatedClient = await client.navigate(targetUrl.href);
            return (navigatedClient ?? client).focus();
          }
        }
        return self.clients.openWindow(targetUrl.href);
      }
    )
  );
});
