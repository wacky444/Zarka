export const TUTORIAL_MATCH_METADATA_KEY = "tutorial" as const;
export const TUTORIAL_BOT_ID = "bot1" as const;

export const TUTORIAL_CELL_COORDS = {
  playerStart: { q: 0, r: 0 },
  botStart: { q: 1, r: 0 },
  doomed: { q: 0, r: 1 },
  spare: { q: 1, r: 1 }
} as const;
export const TUTORIAL_COMPLETION_PROFILE_KEY = "tutorialCompleted" as const;

export const TUTORIAL_STEP_IDS = [
  "map_pan",
  "inspect_current_cell",
  "inspect_nearby_cell",
  "choose_skills",
  "search",
  "pickup_items",
  "feed_bot",
  "bot_chat",
  "open_chat",
  "buy_detective",
  "read_detective_result",
  "plan_axe_attack",
  "resolve_bot_scare",
  "return_to_bot",
  "observe_destruction_warning",
  "scare_bot_to_doomed_cell",
  "resolve_destruction",
  "victory_recap"
] as const;

export type TutorialStepId = (typeof TUTORIAL_STEP_IDS)[number];

export interface TutorialMatchMetadata {
  type: "guided_tutorial";
  version: 1;
}

export interface MatchMetadata {
  [TUTORIAL_MATCH_METADATA_KEY]?: TutorialMatchMetadata;
}
