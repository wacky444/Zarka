import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LOADING_TIPS,
  getRandomLoadingTip,
  getRandomLoadingTipKey,
} from "../src/ui/LoadingTips";
import { getLocale, setLocale, t } from "../src/services/i18n";

test("loading tips collection contains all 6 expected gameplay tips", () => {
  assert.equal(LOADING_TIPS.length, 6);
  assert.ok(
    LOADING_TIPS.includes("Don't attack randomly, you could be hitting your teammates"),
  );
  assert.ok(LOADING_TIPS.includes("Avoid crowded areas"));
  assert.ok(
    LOADING_TIPS.includes(
      "If your health drops to 5 or less, you become unconscious, you become invulnerable (fire, bombard, c4, rocket and virus still damage you)",
    ),
  );
  assert.ok(
    LOADING_TIPS.includes("After being unconscious your max health becomes 5"),
  );
  assert.ok(
    LOADING_TIPS.includes(
      "Same actions of different players are resolved in a random order, unless one player has more agility 2",
    ),
  );
  assert.ok(
    LOADING_TIPS.includes(
      "Put trusted people in your testament, you never know if you will survive one more turn",
    ),
  );
});

test("getRandomLoadingTipKey selects a key belonging to LOADING_TIPS", () => {
  for (let i = 0; i < 20; i++) {
    const key = getRandomLoadingTipKey();
    assert.ok(LOADING_TIPS.includes(key as (typeof LOADING_TIPS)[number]));
  }
});

test("getRandomLoadingTip formats with localized Tip: prefix", () => {
  const previousLocale = getLocale();
  try {
    setLocale("en");
    const enTip = getRandomLoadingTip();
    assert.ok(enTip.startsWith("Tip: "));

    setLocale("es");
    const esTip = getRandomLoadingTip();
    assert.ok(esTip.startsWith("Consejo: "));
  } finally {
    setLocale(previousLocale);
  }
});

test("all loading tips translate correctly in English and Spanish", () => {
  const previousLocale = getLocale();
  try {
    setLocale("es");
    assert.equal(
      t("Don't attack randomly, you could be hitting your teammates"),
      "No ataques al azar, podrías golpear a tus compañeros de equipo",
    );
    assert.equal(t("Avoid crowded areas"), "Evita las zonas concurridas");
    assert.equal(
      t(
        "If your health drops to 5 or less, you become unconscious, you become invulnerable (fire, bombard, c4, rocket and virus still damage you)",
      ),
      "Si tu salud baja a 5 o menos, quedas inconsciente y te vuelves invulnerable (el fuego, bombardeo, C4, cohete y virus todavía te dañan)",
    );
    assert.equal(
      t("After being unconscious your max health becomes 5"),
      "Tras quedar inconsciente, tu salud máxima pasa a ser 5",
    );
    assert.equal(
      t(
        "Same actions of different players are resolved in a random order, unless one player has more agility 2",
      ),
      "Las mismas acciones de diferentes jugadores se resuelven en orden aleatorio, a menos que un jugador tenga más Agilidad 2",
    );
    assert.equal(
      t(
        "Put trusted people in your testament, you never know if you will survive one more turn",
      ),
      "Pon a personas de confianza en tu testamento, nunca se sabe si sobrevivirás un turno más",
    );

    setLocale("en");
    assert.equal(
      t("No ataques al azar, podrías golpear a tus compañeros de equipo"),
      "Don't attack randomly, you could be hitting your teammates",
    );
    assert.equal(t("Evita las zonas concurridas"), "Avoid crowded areas");
    assert.equal(
      t(
        "Si tu salud baja a 5 o menos, quedas inconsciente y te vuelves invulnerable (el fuego, bombardeo, C4, cohete y virus todavía te dañan)",
      ),
      "If your health drops to 5 or less, you become unconscious, you become invulnerable (fire, bombard, c4, rocket and virus still damage you)",
    );
    assert.equal(
      t("Tras quedar inconsciente, tu salud máxima pasa a ser 5"),
      "After being unconscious your max health becomes 5",
    );
    assert.equal(
      t(
        "Las mismas acciones de diferentes jugadores se resuelven en orden aleatorio, a menos que un jugador tenga más Agilidad 2",
      ),
      "Same actions of different players are resolved in a random order, unless one player has more agility 2",
    );
    assert.equal(
      t(
        "Pon a personas de confianza en tu testamento, nunca se sabe si sobrevivirás un turno más",
      ),
      "Put trusted people in your testament, you never know if you will survive one more turn",
    );
  } finally {
    setLocale(previousLocale);
  }
});
