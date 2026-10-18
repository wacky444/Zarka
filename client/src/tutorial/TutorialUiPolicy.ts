import {
  ActionLibrary,
  type ActionId,
  type Axial,
  type ShopId,
  type SkillCategory,
  type SkillId,
  type TutorialStepId,
  TUTORIAL_BOT_ID,
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
  autoSelectTab: boolean;
  highlightedCharacterSubtab: "status" | "skills" | null;
  autoSelectCharacterSubtab: boolean;
  autoSelectPrimaryAction: boolean;
  autoSelectSecondaryAction: boolean;
  highlightedControls: readonly TutorialControlHighlight[];
  mapRequired: boolean;
  actionEditingEnabled: boolean;
  readyEnabled: boolean;
  extraPowerEnabled: boolean;
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
    autoSelectTab: true,
    highlightedCharacterSubtab: null,
    autoSelectCharacterSubtab: false,
    autoSelectPrimaryAction: true,
    autoSelectSecondaryAction: true,
    highlightedControls: NO_HIGHLIGHTS,
    mapRequired: false,
    actionEditingEnabled: false,
    readyEnabled: false,
    extraPowerEnabled: false,
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
    autoSelectCharacterSubtab: false,
    autoSelectSecondaryAction: false,
    highlightedControls: ["secondary_action"],
    secondaryActionIds: [ActionLibrary.search.id],
    actionEditingEnabled: true,
    readyEnabled: true
  }),
  pickup_items: policy({
    ...STATUS_PANEL,
    autoSelectPrimaryAction: false,
    highlightedControls: ["main_action"],
    primaryActionIds: [ActionLibrary.pick_up.id],
    actionEditingEnabled: true,
    readyEnabled: true
  }),
  feed_bot: policy({
    ...STATUS_PANEL,
    autoSelectSecondaryAction: false,
    highlightedControls: ["secondary_action"],
    secondaryActionIds: [ActionLibrary.feed.id],
    actionEditingEnabled: true,
    readyEnabled: true
  }),
  bot_chat: policy({
    highlightedTab: "chat",
    autoSelectTab: false
  }),
  open_chat: policy({
    highlightedTab: "chat",
    autoSelectTab: false
  }),
  buy_detective: policy({
    highlightedTab: "shop",
    autoSelectTab: false,
    highlightedControls: ["detective"],
    shopIds: ["detective"]
  }),
  read_detective_result: policy({
    highlightedTab: "log",
    autoSelectTab: false
  }),
  plan_axe_attack: policy({
    ...STATUS_PANEL,
    autoSelectTab: false,
    autoSelectCharacterSubtab: false,
    autoSelectPrimaryAction: false,
    highlightedControls: ["main_action"],
    primaryActionIds: [ActionLibrary.axe_attack.id],
    actionEditingEnabled: true,
    readyEnabled: true
  }),
  resolve_bot_scare: policy({
    ...STATUS_PANEL,
    highlightedControls: ["ready"],
    primaryActionIds: [ActionLibrary.axe_attack.id],
    readyEnabled: true
  }),
  return_to_bot: policy({
    ...STATUS_PANEL,
    highlightedControls: ["main_action", "location_target"],
    primaryActionIds: [ActionLibrary.move.id],
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
    primaryActionIds: [ActionLibrary.scare.id],
    actionEditingEnabled: true,
    readyEnabled: true,
    extraPowerEnabled: true
  }),
  resolve_destruction: policy({
    ...STATUS_PANEL,
    highlightedControls: ["ready"],
    primaryActionIds: [ActionLibrary.scare.id],
    readyEnabled: true,
    extraPowerEnabled: true
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
    targetPlayerId?: string | null;
    secondaryActionId?: string | null;
  }
): boolean {
  if (!stepId) {
    return true;
  }
  const policy = getTutorialUiPolicy(stepId);
  if (!policy.readyEnabled) {
    return false;
  }
  if (stepId === "search") {
    const sec = options.secondaryActionId?.trim().toLowerCase();
    return sec === ActionLibrary.search.id;
  }
  if (stepId === "pickup_items") {
    const main = options.mainActionId?.trim().toLowerCase();
    return main === ActionLibrary.pick_up.id;
  }
  if (stepId === "feed_bot") {
    const sec = options.secondaryActionId?.trim().toLowerCase();
    return sec === ActionLibrary.feed.id;
  }
  if (stepId === "plan_axe_attack") {
    const isAxe = options.mainActionId === ActionLibrary.axe_attack.id;
    return isAxe;
  }
  if (stepId === "return_to_bot") {
    const isMove = options.mainActionId === ActionLibrary.move.id;
    const isStartCell =
      options.targetLocation !== null &&
      options.targetLocation !== undefined &&
      options.targetLocation.q === TUTORIAL_CELL_COORDS.playerStart.q &&
      options.targetLocation.r === TUTORIAL_CELL_COORDS.playerStart.r;
    return isMove && isStartCell;
  }
  if (stepId === "scare_bot_to_doomed_cell" || stepId === "resolve_destruction") {
    const isScare = options.mainActionId === ActionLibrary.scare.id;
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

export interface TutorialSkillHighlightState {
  highlightedCategory: SkillCategory | null;
  confirmHighlighted: boolean;
  highlightStrength2Upgrade: boolean;
  highlightVitalityUpgrade: boolean;
}

export function getTutorialSkillHighlights(options: {
  isTutorialChooseSkills: boolean;
  pendingUpgrades: readonly SkillId[];
  abilities?: readonly SkillId[];
}): TutorialSkillHighlightState {
  if (!options.isTutorialChooseSkills) {
    return {
      highlightedCategory: null,
      confirmHighlighted: false,
      highlightStrength2Upgrade: false,
      highlightVitalityUpgrade: false
    };
  }

  const abilities = options.abilities ?? [];
  const hasVitality =
    options.pendingUpgrades.indexOf("vitality") !== -1 ||
    abilities.indexOf("vitality") !== -1;
  const hasStrength =
    options.pendingUpgrades.indexOf("strength2") !== -1 ||
    abilities.indexOf("strength2") !== -1;

  const bothSelected = hasVitality && hasStrength;

  if (bothSelected) {
    return {
      highlightedCategory: null,
      confirmHighlighted: true,
      highlightStrength2Upgrade: false,
      highlightVitalityUpgrade: false
    };
  }

  return {
    highlightedCategory: !hasVitality
      ? "defense"
      : !hasStrength
        ? "offensive"
        : null,
    confirmHighlighted: false,
    highlightStrength2Upgrade: !hasStrength,
    highlightVitalityUpgrade: !hasVitality
  };
}
