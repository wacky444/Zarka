import type { TutorialStepId } from "@shared";

export interface TutorialInstructionCopy {
  instruction: string;
  hint: string;
}

export const TUTORIAL_INSTRUCTIONS: Record<
  TutorialStepId,
  TutorialInstructionCopy
> = {
  map_pan: {
    instruction:
      "Look around first. Drag the map to see the whole 2×2 board before choosing an action.",
    hint: "Press or touch an empty part of the map, then drag in any direction."
  },
  inspect_current_cell: {
    instruction:
      "Open the information for the cell your character is standing on.",
    hint: "Select your current cell on the map to open its information panel."
  },
  inspect_nearby_cell: {
    instruction:
      "Now inspect one nearby cell. Knowing where you can move helps you plan safely.",
    hint: "Choose any cell directly next to your current one."
  },
  choose_skills: {
    instruction:
      "Choose Vitality for more HP and Strength 2 to make axe attacks cost less energy.",
    hint: "Open Character → Skills. Buy both skills; you can switch between Offensive and Defense."
  },
  search: {
    instruction:
      "Search this cell to reveal objects that are hidden from you.",
    hint: "Search is the only available secondary action. Submit the turn with Ready."
  },
  pickup_items: {
    instruction:
      "Pick up the visible bandage, axe, and food so you can use them later.",
    hint: "Pick Up is the only available main action. The visible objects are on your cell."
  },
  feed_bot: {
    instruction:
      "Use Feed on yourself. It restores energy, and your planned turn will bring the bot to your cell.",
    hint: "Feed is the only available secondary action. Submit the turn with Ready."
  },
  bot_chat: {
    instruction:
      "The bot has entered your cell and sent a message. Open Chat to read it.",
    hint: "The orange marker means Chat has an unread message."
  },
  open_chat: {
    instruction:
      "Read the bot’s claim in Chat. Do not trust a team claim until you verify it.",
    hint: "Open the Chat tab. Its unread marker clears when the tab is opened."
  },
  buy_detective: {
    instruction:
      "Use the Detective shop item to check the bot’s team instead of trusting its claim.",
    hint: "Open Shop, choose Detective, select the bot, then confirm the purchase."
  },
  read_detective_result: {
    instruction:
      "Read the private Detective result in the Log to learn the bot’s real team.",
    hint: "Open Log and select the current turn if the result is not already shown."
  },
  plan_axe_attack: {
    instruction:
      "Plan an Axe attack against the bot. Your attack is planned now, but it resolves later.",
    hint: "Axe Attack is prepared. Select Tutorial Bot as the target, then press Ready."
  },
  resolve_bot_scare: {
    instruction:
      "Watch the order: the bot’s Scare moves you before your planned Axe attack resolves.",
    hint: "Press Ready to submit the plan. The Log will show why the attack misses."
  },
  return_to_bot: {
    instruction:
      "Move back toward the bot. The map is about to become dangerous.",
    hint: "Move is prepared. Select the bot’s cell, then press Ready."
  },
  observe_destruction_warning: {
    instruction:
      "Notice the skull warning: this cell will be destroyed on the next turn.",
    hint: "The warning and Log show how many turns remain before destruction."
  },
  scare_bot_to_doomed_cell: {
    instruction:
      "Use Scare with one extra execution to choose the bot’s destination: the doomed cell.",
    hint: "Scare is prepared. Set Extra Power to 1, target the bot, and select the skull-marked cell."
  },
  resolve_destruction: {
    instruction:
      "Submit the final plan. The bot will be moved onto the doomed cell and normal destruction will resolve.",
    hint: "Press Ready and watch the map warning, damage, and victory flow."
  },
  victory_recap: {
    instruction:
      "You won by combining information, preparation, positioning, and timing.",
    hint: "The victory screen recaps the lessons before opening the normal match report."
  }
};
