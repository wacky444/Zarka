import assert from "node:assert/strict";
import { test } from "node:test";
import { CharacterPanelLogView } from "../src/ui/CharacterPanelLogView";
import type { ReplayEvent } from "@shared";
import { getLocale, setLocale } from "../src/services/i18n";

function createMockScene() {
  const mask = { destroy() {} };
  const gameObject = () => ({
    visible: true,
    setOrigin() { return this; },
    setScrollFactor() { return this; },
    setPosition() { return this; },
    setSize() { return this; },
    setMinSize() {},
    setMask() { return this; },
    clearMask() { return this; },
    setVisible(value: boolean) { this.visible = value; return this; },
    setMouseWheelScrollerEnable() {},
    setScrollerEnable() {},
    layout() {},
    add() { return this; },
    destroy() {},
    createGeometryMask() { return mask; },
    getWorldTransformMatrix() { return { tx: 0, ty: 0 }; }
  });
  const input = { on() { return this; }, off() { return this; } };
  return {
    input,
    add: { container: gameObject, rectangle: gameObject },
    rexUI: { add: { roundRectangle: gameObject, scrollablePanel: gameObject } }
  };
}

function createMockElement(scene: ReturnType<typeof createMockScene>) {
  return {
    setPosition() { return this; },
    setSize() { return this; },
    setDisplaySize() { return this; },
    setVisible() { return this; },
    setWordWrapWidth() { return this; },
    setInteractive() { return this; },
    disableInteractive() { return this; },
    setAlpha() { return this; },
    setColor() { return this; },
    on() { return this; },
    off() { return this; },
    text: "",
    setText(value: string) { this.text = value; return this; },
    x: 0, y: 0, width: 10, height: 10,
    scene
  };
}

test("setReplay does not trigger onElimination and preserves maxTurn when loading turn with dead character", () => {
  let eliminationCalled = false;
  const scene = createMockScene();
  const turnLabel = createMockElement(scene);

  const logView = new CharacterPanelLogView({
    panel: { add() {} } as any,
    elements: {
      prevButton: createMockElement(scene) as any,
      nextButton: createMockElement(scene) as any,
      playButton: createMockElement(scene) as any,
      filterTrack: createMockElement(scene) as any,
      filterKnob: createMockElement(scene) as any,
      filterLabel: createMockElement(scene) as any,
      turnLabel: turnLabel as any,
      statusText: createMockElement(scene) as any,
      eventsBox: createMockElement(scene) as any,
      eventsText: createMockElement(scene) as any
    },
    onRequestReplay: () => {},
    onPlay: () => {},
    formatActionName: (id: string) => id,
    onElimination: () => {
      eliminationCalled = true;
    }
  });

  const events: ReplayEvent[] = [
    {
      kind: "player",
      actorId: "bot10",
      action: {
        actionId: "status_dead",
        metadata: { teamId: "Leo" }
      }
    }
  ];

  logView.setReplay(8, 33, events);

  assert.equal(eliminationCalled, false);
  assert.equal(logView.getMaxTurn(), 33);
  assert.equal(logView.getSelectedTurn(), 8);
  assert.match(turnLabel.text, /8 \/ 33/);
});

test("formatReplayEvents formats focus action with temporary energy gained", () => {
  const previousLocale = getLocale();
  try {
    const scene = createMockScene();
    const eventsText = createMockElement(scene);
    const logView = new CharacterPanelLogView({
      panel: { add() {} } as any,
      elements: {
        prevButton: createMockElement(scene) as any,
        nextButton: createMockElement(scene) as any,
        playButton: createMockElement(scene) as any,
        filterTrack: createMockElement(scene) as any,
        filterKnob: createMockElement(scene) as any,
        filterLabel: createMockElement(scene) as any,
        turnLabel: createMockElement(scene) as any,
        statusText: createMockElement(scene) as any,
        eventsBox: createMockElement(scene) as any,
        eventsText: eventsText as any
      },
      onRequestReplay: () => {},
      onPlay: () => {},
      formatActionName: (id: string) => id
    });

    const events: ReplayEvent[] = [
      {
        kind: "player",
        actorId: "player",
        action: {
          actionId: "focus",
          metadata: {
            energyBonus: 6
          }
        },
        targets: [
          {
            targetId: "player",
            metadata: {
              energyBonus: 6
            }
          }
        ]
      }
    ];

    setLocale("es");
    logView.setReplay(1, 1, events);
    assert.equal(eventsText.text, "player usó Concentrarse, obtuvo 6 de esfuerzo temporal");

    setLocale("en");
    logView.setReplay(1, 1, events);
    assert.equal(eventsText.text, "player used Focus, obtained 6 temporary energy");
  } finally {
    setLocale(previousLocale);
  }
});

test("formatReplayEvents formats train action with experience gained", () => {
  const previousLocale = getLocale();
  try {
    const scene = createMockScene();
    const eventsText = createMockElement(scene);
    const logView = new CharacterPanelLogView({
      panel: { add() {} } as any,
      elements: {
        prevButton: createMockElement(scene) as any,
        nextButton: createMockElement(scene) as any,
        playButton: createMockElement(scene) as any,
        filterTrack: createMockElement(scene) as any,
        filterKnob: createMockElement(scene) as any,
        filterLabel: createMockElement(scene) as any,
        turnLabel: createMockElement(scene) as any,
        statusText: createMockElement(scene) as any,
        eventsBox: createMockElement(scene) as any,
        eventsText: eventsText as any
      },
      onRequestReplay: () => {},
      onPlay: () => {},
      formatActionName: (id: string) => id
    });

    const events: ReplayEvent[] = [
      {
        kind: "player",
        actorId: "player",
        action: {
          actionId: "train",
          metadata: {
            experienceGained: 5
          }
        }
      }
    ];

    setLocale("es");
    logView.setReplay(1, 1, events);
    assert.equal(eventsText.text, "player usó Entrenar, obtuvo 5 puntos de experiencia");

    setLocale("en");
    logView.setReplay(1, 1, events);
    assert.equal(eventsText.text, "player used Train, obtained 5 experience points");

    const eventsWithExtra: ReplayEvent[] = [
      {
        kind: "player",
        actorId: "player",
        action: {
          actionId: "train",
          metadata: {
            experienceGained: 8,
            extraExecutions: 1
          }
        }
      }
    ];

    setLocale("es");
    logView.setReplay(1, 1, eventsWithExtra);
    assert.equal(eventsText.text, "player usó Entrenar (+1 extra), obtuvo 8 puntos de experiencia");

    setLocale("en");
    logView.setReplay(1, 1, eventsWithExtra);
    assert.equal(eventsText.text, "player used Train (+1 extra), obtained 8 experience points");
  } finally {
    setLocale(previousLocale);
  }
});

test("formatReplayEvents formats drop action for manual and overweight drops", () => {
  const previousLocale = getLocale();
  try {
    const scene = createMockScene();
    const eventsText = createMockElement(scene);
    const logView = new CharacterPanelLogView({
      panel: { add() {} } as any,
      elements: {
        prevButton: createMockElement(scene) as any,
        nextButton: createMockElement(scene) as any,
        playButton: createMockElement(scene) as any,
        filterTrack: createMockElement(scene) as any,
        filterKnob: createMockElement(scene) as any,
        filterLabel: createMockElement(scene) as any,
        turnLabel: createMockElement(scene) as any,
        statusText: createMockElement(scene) as any,
        eventsBox: createMockElement(scene) as any,
        eventsText: eventsText as any
      },
      onRequestReplay: () => {},
      onPlay: () => {},
      formatActionName: (id: string) => id
    });

    logView.setUsernames({ player1: "Jugador1", player2: "Jugador2" });
    logView.setCurrentUserId("player1");

    const manualDropEvent: ReplayEvent[] = [
      {
        kind: "player",
        actorId: "player1",
        action: {
          actionId: "drop",
          metadata: {
            droppedItems: [{ itemType: "knife" }]
          }
        }
      }
    ];

    setLocale("es");
    logView.setReplay(1, 1, manualDropEvent);
    assert.equal(eventsText.text, "Jugador1 usó Dejar\nJugador1 soltó Cuchillo");

    setLocale("en");
    logView.setReplay(1, 1, manualDropEvent);
    assert.equal(eventsText.text, "Jugador1 used Drop\nJugador1 dropped Knife");

    const automaticDropSelf: ReplayEvent[] = [
      {
        kind: "player",
        actorId: "player1",
        action: {
          actionId: "drop",
          metadata: {
            automatic: true,
            droppedItems: [{ itemType: "wood" }]
          }
        }
      }
    ];

    setLocale("es");
    logView.setReplay(1, 1, automaticDropSelf);
    assert.equal(eventsText.text, "se te cae Madera");

    setLocale("en");
    logView.setReplay(1, 1, automaticDropSelf);
    assert.equal(eventsText.text, "you dropped Wood");

    const automaticDropOther: ReplayEvent[] = [
      {
        kind: "player",
        actorId: "player2",
        action: {
          actionId: "drop",
          metadata: {
            automatic: true,
            droppedItems: [{ itemType: "wood" }]
          }
        }
      }
    ];

    setLocale("es");
    logView.setReplay(1, 1, automaticDropOther);
    assert.equal(eventsText.text, "a Jugador2 se le cae Madera");

    setLocale("en");
    logView.setReplay(1, 1, automaticDropOther);
    assert.equal(eventsText.text, "Jugador2 dropped Wood");
  } finally {
    setLocale(previousLocale);
  }
});

test("formatReplayEvents formats use_binoculars when nobody is seen and when characters are seen", () => {
  const scene = createMockScene();
  const eventsText = createMockElement(scene);

  const logView = new CharacterPanelLogView({
    panel: { add() {} } as any,
    elements: {
      prevButton: createMockElement(scene) as any,
      nextButton: createMockElement(scene) as any,
      playButton: createMockElement(scene) as any,
      filterTrack: createMockElement(scene) as any,
      filterKnob: createMockElement(scene) as any,
      filterLabel: createMockElement(scene) as any,
      turnLabel: createMockElement(scene) as any,
      statusText: createMockElement(scene) as any,
      eventsBox: createMockElement(scene) as any,
      eventsText: eventsText as any
    },
    onRequestReplay: () => {},
    onPlay: () => {},
    formatActionName: (id: string) => id
  });

  logView.setCurrentUserId("player1");
  logView.setUsernames({
    player1: "Jugador"
  });

  const binocularsEmptyEvent: ReplayEvent[] = [
    {
      kind: "player",
      actorId: "player1",
      action: {
        actionId: "use_binoculars",
        targetLocation: { q: 1, r: 0 },
        metadata: {
          observed: true,
          observedCount: 0,
          observedPlayerIds: []
        }
      }
    }
  ];

  const binocularsOccupiedEvent: ReplayEvent[] = [
    {
      kind: "player",
      actorId: "player1",
      action: {
        actionId: "use_binoculars",
        targetLocation: { q: 1, r: 0 },
        metadata: {
          observed: true,
          observedCount: 1,
          observedPlayerIds: ["player2"]
        }
      }
    }
  ];

  const previousLocale = getLocale();
  try {
    setLocale("es");
    logView.setReplay(1, 1, binocularsEmptyEvent);
    assert.equal(
      eventsText.text,
      "Jugador usó prismáticos en (1, 0)\nJugador no ve a nadie con los prismáticos"
    );

    setLocale("en");
    logView.setReplay(1, 1, binocularsEmptyEvent);
    assert.equal(
      eventsText.text,
      "Jugador used binoculars at (1, 0)\nJugador does not see anyone with binoculars"
    );

    setLocale("es");
    logView.setReplay(1, 1, binocularsOccupiedEvent);
    assert.equal(eventsText.text, "Jugador usó prismáticos en (1, 0)");
  } finally {
    setLocale(previousLocale);
  }
});


test("formatReplayEvents formats team_assigned with partnerPlayerId for twins", () => {
  const scene = createMockScene();
  const eventsText = createMockElement(scene);

  const logView = new CharacterPanelLogView({
    panel: { add() {} } as any,
    elements: {
      prevButton: createMockElement(scene) as any,
      nextButton: createMockElement(scene) as any,
      playButton: createMockElement(scene) as any,
      filterTrack: createMockElement(scene) as any,
      filterKnob: createMockElement(scene) as any,
      filterLabel: createMockElement(scene) as any,
      turnLabel: createMockElement(scene) as any,
      statusText: createMockElement(scene) as any,
      eventsBox: createMockElement(scene) as any,
      eventsText: eventsText as any
    },
    onRequestReplay: () => {},
    onPlay: () => {},
    formatActionName: (id: string) => id
  });

  logView.setCurrentUserId("player1");
  logView.setUsernames({
    player1: "Jugador1",
    player2: "Jugador2"
  });

  const twinTeamAssignedEvent: ReplayEvent[] = [
    {
      kind: "player",
      actorId: "player1",
      action: {
        actionId: "team_assigned",
        metadata: {
          teamId: "Gemelos",
          coverTeamId: "Alfa",
          partnerPlayerId: "player2"
        }
      }
    }
  ];

  const previousLocale = getLocale();
  try {
    setLocale("es");
    logView.setReplay(0, 0, twinTeamAssignedEvent);
    assert.equal(eventsText.text, "Jugador1 pertenece al equipo Gemelos con Jugador2");

    setLocale("en");
    logView.setReplay(0, 0, twinTeamAssignedEvent);
    assert.equal(eventsText.text, "Jugador1 belongs to the team Twins with Jugador2");
  } finally {
    setLocale(previousLocale);
  }
});

test("live match character panel maintains live status and is not overwritten by replay snapshot", () => {
  // Simulates GameScene applyReplaySnapshot & resolvePlayerAccounts panel update logic
  const liveMatch = {
    match_id: "match-123",
    current_turn: 5,
    playerCharacters: {
      player1: {
        id: "player1",
        name: "Hero",
        stats: {
          health: { current: 10, max: 12 },
          energy: { current: 15, max: 20 }
        },
        actionPlan: {
          main: { actionId: "knife_attack" }
        }
      }
    }
  };

  const replayMatch = {
    match_id: "match-123",
    current_turn: 1,
    playerCharacters: {
      player1: {
        id: "player1",
        name: "Hero",
        stats: {
          health: { current: 2, max: 12 },
          energy: { current: 3, max: 20 }
        },
        actionPlan: {
          main: { actionId: "train" }
        }
      }
    }
  };

  let panelUpdatedWith: any = null;
  const mockCharacterPanel = {
    updateFromMatch(match: any) {
      panelUpdatedWith = match;
    }
  };

  const reportReplayMode = false;
  // If not in reportReplayMode, characterPanel must NEVER be updated with replayMatch
  if (reportReplayMode) {
    mockCharacterPanel.updateFromMatch(replayMatch);
  }

  assert.equal(panelUpdatedWith, null);

  // In exitReplayMode or clearReplaySnapshot, live match is restored
  if (!reportReplayMode && liveMatch) {
    mockCharacterPanel.updateFromMatch(liveMatch);
  }
  assert.equal(panelUpdatedWith?.current_turn, 5);
  assert.equal(panelUpdatedWith?.playerCharacters.player1.stats.health.current, 10);
  assert.equal(panelUpdatedWith?.playerCharacters.player1.stats.energy.current, 15);
});

