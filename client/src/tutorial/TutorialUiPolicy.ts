import {
  type ActionId,
  type Axial,
  type ShopId,
  type SkillId,
  type TutorialStepId,
  TUTORIAL_CELL_COORDS
} from "@shared";
import type { TabKey } from "../ui/CharacterPanelTabs";

export type TutorialControlHighlight =
  | "main_action"
  | "secondary_action"
  | "ready"
  | "skills"
  | "detective"
  | "extra_execution"
  | "player_target"
  | "location_target";

export interface TutorialUiPolicy {
  primaryActionIds: readonly ActionId[];
  secondaryActionIds: readonly ActionId[];
  skillIds: readonly SkillId[];
  shopIds: readonly ShopId[];
  highlightedTab: TabKey | null;
  highlightedCharacterSubtab: "status" | "skills" | null;
  autoSelectCharacterSubtab: boolean;
  highlightedControls: readonly TutorialControlHighlight[];
  mapRequired: boolean;
  actionEditingEnabled: boolean;
  readyEnabled: boolean;
}

const NO_ACTIONS: readonly ActionId[] = [];
const NO_SKILLS: readonly SkillId[] = [];
const NO_SHOP_ITEMS: readonly ShopId[] = [];
const NO_HIGHLIGHTS: readonly TutorialControlHighlight[] = [];

function policy(
  options: Partial<TutorialUiPolicy> = {}
): TutorialUiPolicy {
  return {
    primaryActionIds: NO_ACTIONS,
    secondaryActionIds: NO_ACTIONS,
    skillIds: NO_SKILLS,
    shopIds: NO_SHOP_ITEMS,
    highlightedTab: null,
    highlightedCharacterSubtab: null,
    autoSelectCharacterSubtab: false,
    highlightedControls: NO_HIGHLIGHTS,
    mapRequired: false,
    actionEditingEnabled: false,
    readyEnabled: false,
    ...options
  };
}

const STATUS_PANEL = {
  highlightedTab: "character" as const,
  highlightedCharacterSubtab: "status" as const,
  autoSelectCharacterSubtab: true
};

const STEP_POLICIES: Record<TutorialStepId, TutorialUiPolicy> = {
  map_pan: policy({ mapRequired: true }),
  inspect_current_cell: policy({ mapRequired: true }),
  inspect_nearby_cell: policy({ mapRequired: true }),
  choose_skills: policy({
    highlightedTab: "character",
    highlightedCharacterSubtab: "skills",
    highlightedControls: ["skills"],
    skillIds: ["vitality", "strength2"]
  }),
  search: policy({
    ...STATUS_PANEL,
    highlightedControls: ["secondary_action"],
    secondaryActionIds: ["search"],
    actionEditingEnabled: true,
    readyEnabled: true
  }),
  pickup_items: policy({
    ...STATUS_PANEL,
    highlightedControls: ["main_action"],
    primaryActionIds: ["pick_up"],
    actionEditingEnabled: true,
    readyEnabled: true
  }),
  feed_bot: policy({
    ...STATUS_PANEL,
    highlightedControls: ["secondary_action"],
    secondaryActionIds: ["feed"],
    actionEditingEnabled: true,
    readyEnabled: true
  }),
  bot_chat: policy({
    highlightedTab: "chat"
  }),
  open_chat: policy({
    highlightedTab: "chat"
  }),
  buy_detective: policy({
    highlightedTab: "shop",
    highlightedControls: ["detective"],
    shopIds: ["detective"]
  }),
  read_detective_result: policy({
    highlightedTab: "log"
  }),
  plan_axe_attack: policy({
    ...STATUS_PANEL,
    highlightedControls: ["main_action", "player_target"],
    primaryActionIds: ["axe_attack"],
    actionEditingEnabled: true,
    readyEnabled: true
  }),
  resolve_bot_scare: policy({
    ...STATUS_PANEL,
    highlightedControls: ["ready"],
    primaryActionIds: ["axe_attack"],
    readyEnabled: true
  }),
  return_to_bot: policy({
    ...STATUS_PANEL,
    highlightedControls: ["main_action", "location_target"],
    primaryActionIds: ["move"],
    actionEditingEnabled: true,
    readyEnabled: true
  }),
  observe_destruction_warning: policy({ mapRequired: true }),
  scare_bot_to_doomed_cell: policy({
    ...STATUS_PANEL,
    highlightedControls: [
      "main_action",
      "extra_execution",
      "player_target",
      "location_target"
    ],
    primaryActionIds: ["scare"],
    actionEditingEnabled: true,
    readyEnabled: true
  }),
  resolve_destruction: policy({
    ...STATUS_PANEL,
    highlightedControls: ["ready"],
    primaryActionIds: ["scare"],
    readyEnabled: true
  }),
  victory_recap: policy()
};

export function getTutorialUiPolicy(
  stepId: TutorialStepId | null
): TutorialUiPolicy {
  return stepId ? STEP_POLICIES[stepId] : policy();
}

export function isTutorialReadyActionAllowed(
  stepId: TutorialStepId | null,
  options: {
    mainActionId?: string | null;
    targetLocation?: Axial | null;
    extraExecutions?: number;
  }
): boolean {
  if (!stepId) {
    return true;
  }
  const policy = getTutorialUiPolicy(stepId);
  if (!policy.readyEnabled) {
    return false;
  }
  if (stepId === "return_to_bot") {
    const isMove = options.mainActionId === "move";
    const isStartCell =
      options.targetLocation !== null &&
      options.targetLocation !== undefined &&
      options.targetLocation.q === TUTORIAL_CELL_COORDS.playerStart.q &&
      options.targetLocation.r === TUTORIAL_CELL_COORDS.playerStart.r;
    return isMove && isStartCell;
  }
  if (stepId === "scare_bot_to_doomed_cell" || stepId === "resolve_destruction") {
    const isScare = options.mainActionId === "scare";
    const hasExtraPower = (options.extraExecutions ?? 0) >= 1;
    const isDoomedCell =
      options.targetLocation !== null &&
      options.targetLocation !== undefined &&
      options.targetLocation.q === TUTORIAL_CELL_COORDS.doomed.q &&
      options.targetLocation.r === TUTORIAL_CELL_COORDS.doomed.r;
    return isScare && hasExtraPower && isDoomedCell;
  }
  return true;
}
