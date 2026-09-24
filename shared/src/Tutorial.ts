import { NAKAMA_SYSTEM_USER_ID } from "./chat";

export const TUTORIAL_MATCH_METADATA_KEY = "tutorial" as const;
export const TUTORIAL_BOT_ID = "bot1" as const;
export const TUTORIAL_BOT_NAME = "Tutorial Bot" as const;
export const TUTORIAL_BOT_SYSTEM_SENDER_ID = NAKAMA_SYSTEM_USER_ID;

export const TUTORIAL_BOT_MESSAGE_KEYS = [
  "bot_claim",
  "detective_result",
  "axe_ordering",
  "destruction_warning"
] as const;

export type TutorialBotMessageKey =
  (typeof TUTORIAL_BOT_MESSAGE_KEYS)[number];

export const TUTORIAL_BOT_MESSAGES: Record<TutorialBotMessageKey, string> = {
  bot_claim: "I am on your team. You can trust me.",
  detective_result:
    "You checked instead of trusting me. Information can be more valuable than an attack.",
  axe_ordering:
    "You planned to attack me, but actions resolve in an order. Scare can move you before your attack happens.",
  destruction_warning:
    "The map itself is dangerous. Watch the warning, then use positioning to survive."
};

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
