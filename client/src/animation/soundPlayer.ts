import Phaser from "phaser";
import { assetPath } from "../utils/assetPath";

export interface PlaySoundOptions {
  volume?: number;
  pitchRange?: number;
  rateRange?: number;
}

export const SOUND_ASSET_FILES: Record<string, string> = {
  punch: "punch.wav",
  punch_2: "punch_2.wav",
  punch_3: "punch_3.wav",
  sword_slice: "sword_slice.wav",
  swipe: "swipe.wav",
  crunch_quick: "crunch_quick.wav",
  harsh_thud: "harsh_thud.wav",
  cardboard_hit: "cardboard_hit.wav",
  metal_blunt_tap: "metal_blunt_tap.wav",
  sword_light: "sword_light.wav",
  cork_stabbed: "cork_stabbed.wav",
  sword_sharpen: "sword_sharpen.wav",
  foley_footstep_concrete_1: "foley_footstep_concrete_1.wav",
  foley_footstep_concrete_2: "foley_footstep_concrete_2.wav",
  foley_footstep_concrete_3: "foley_footstep_concrete_3.wav",
  foley_footstep_concrete_4: "foley_footstep_concrete_4.wav",
  weapon_pick_up: "weapon_pick_up.wav",
  item_equip: "item_equip.wav",
  wood_small_pickup: "wood_small_pickup.wav",
  weapon_drop: "weapon_drop.wav",
  wood_small_drop: "wood_small_drop.wav",
  cardboard_drop: "cardboard_drop.wav",
  page_turn: "page_turn.wav",
  paper_move: "paper_move.wav",
  paper_scrunch: "paper_scrunch.wav",
  munching_food: "munching_food.wav",
  drink_slurp: "drink_slurp.wav",
  clothing_1: "clothing_1.wav",
  clothing_2: "clothing_2.wav",
  paper_tear_1: "paper_tear_1.wav",
  power_up: "power_up.wav",
  power_up_2: "power_up_2.wav",
  heart_collect: "heart_collect.wav",
  whoosh_1: "whoosh_1.wav",
  whoosh_2: "whoosh_2.wav",
  air_burst: "air_burst.wav",
  sword_clash: "sword_clash.wav",
  sword_clash_2: "sword_clash_2.wav",
  metal_clang: "metal_clang.wav",
  horror_sting: "horror_sting.wav",
  ghost: "ghost.wav",
  ghost_long: "ghost_long.wav",
  sci_fi_hover: "sci_fi_hover.wav",
  sci_fi_select: "sci_fi_select.wav",
  pop_1: "pop_1.wav",
  squelching_1: "squelching_1.wav",
  squelching_2: "squelching_2.wav",
  water_splashing: "water_splashing.wav",
  lose: "lose.wav",
  "8_bit_defeated": "8_bit_defeated.wav",
  hurt: "hurt.wav",
  undesired_effect: "undesired_effect.wav",
  sci_fi_error: "sci_fi_error.wav",
  cancel: "cancel.wav",
  explosion_small: "explosion_small.wav",
  explosion_medium: "explosion_medium.wav",
  explosion_large: "explosion_large.wav",
  wobble: "wobble.wav",
  snap: "snap.wav",
  bone_snap: "bone_snap.wav",
  lock_quick: "lock_quick.wav",
  fire_lighting: "fire_lighting.wav",
  shot_muffled: "shot_muffled.wav",
};

export const ACTION_SOUNDS: Record<string, string[]> = {
  punch: ["punch", "punch_2", "punch_3"],
  axe_attack: ["sword_slice", "swipe", "crunch_quick"],
  bat_attack: ["harsh_thud", "cardboard_hit", "metal_blunt_tap"],
  knife_attack: ["sword_light", "cork_stabbed", "sword_sharpen"],
  shoot_pistol: ["shot_muffled", "explosion_small", "air_burst"],
  shoot_harpoon: ["whoosh_1", "swipe", "cork_stabbed"],
  move: [
    "foley_footstep_concrete_1",
    "foley_footstep_concrete_2",
    "foley_footstep_concrete_3",
    "foley_footstep_concrete_4",
  ],
  pick_up: ["weapon_pick_up", "item_equip", "wood_small_pickup"],
  drop: ["weapon_drop", "wood_small_drop", "cardboard_drop"],
  search: ["page_turn", "paper_move", "paper_scrunch"],
  feed: ["munching_food", "drink_slurp"],
  breakfast: ["munching_food", "drink_slurp"],
  use_bandage: ["clothing_1", "clothing_2", "paper_tear_1"],
  recover: ["power_up", "power_up_2", "heart_collect"],
  focus: ["whoosh_1", "whoosh_2", "air_burst"],
  protect: ["sword_clash", "sword_clash_2", "metal_clang"],
  scare: ["horror_sting", "ghost", "ghost_long"],
  detect: ["sci_fi_hover", "sci_fi_select", "pop_1"],
  use_chemical_weapon: ["squelching_1", "squelching_2", "water_splashing"],
  status_dead: ["lose", "8_bit_defeated", "hurt"],
  status_unconscious: ["wobble"],
  place_trap: ["lock_quick", "snap"],
  fire_damage: ["fire_lighting", "hurt"],
  fire_rocket_launcher: ["explosion_large", "explosion_medium", "explosion_small"],
  buy_bomber: ["explosion_large", "explosion_medium", "explosion_small"],
  failedAction: ["undesired_effect", "sci_fi_error", "cancel"],
  tile_destroyed: ["explosion_small", "explosion_medium"],
};

export function preloadReplaySounds(scene: Phaser.Scene): void {
  for (const [key, filename] of Object.entries(SOUND_ASSET_FILES)) {
    if (!scene.cache.audio.exists(key)) {
      scene.load.audio(key, assetPath(`assets/sounds/${filename}`));
    }
  }
}

export function playRandomSound(
  scene: Phaser.Scene,
  soundKeys: string | string[],
  options?: PlaySoundOptions
): void {
  if (!scene || !scene.sound) {
    return;
  }
  const keys = Array.isArray(soundKeys) ? soundKeys : [soundKeys];
  if (keys.length === 0) {
    return;
  }
  const chosenKey = keys[Math.floor(Math.random() * keys.length)];
  if (!scene.cache.audio.exists(chosenKey)) {
    return;
  }
  const pitchRange = options?.pitchRange ?? 100;
  const rateRange = options?.rateRange ?? 0.08;
  const detune = Phaser.Math.Between(-pitchRange, pitchRange);
  const rate = 1 + (Math.random() * 2 - 1) * (rateRange / 2);
  const volume = options?.volume ?? 0.75;

  scene.sound.play(chosenKey, {
    detune,
    rate,
    volume,
  });
}

export function playActionSound(
  scene: Phaser.Scene,
  actionId: string,
  options?: PlaySoundOptions
): void {
  const soundKeys = ACTION_SOUNDS[actionId];
  if (soundKeys && soundKeys.length > 0) {
    playRandomSound(scene, soundKeys, options);
  }
}

export const DEFAULT_VOLUME_LEVEL = 5;
export const MAX_VOLUME_LEVEL = 10;
export const VOLUME_STORAGE_KEY = "zarka_volume_level";

export function getStoredVolumeLevel(): number {
  try {
    const raw = localStorage.getItem(VOLUME_STORAGE_KEY);
    if (raw !== null) {
      const parsed = parseInt(raw, 10);
      if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= MAX_VOLUME_LEVEL) {
        return parsed;
      }
    }
  } catch {
    return DEFAULT_VOLUME_LEVEL;
  }
  return DEFAULT_VOLUME_LEVEL;
}

export function setGameVolumeLevel(scene: Phaser.Scene, level: number): void {
  const clamped = Math.max(0, Math.min(MAX_VOLUME_LEVEL, Math.round(level)));
  try {
    localStorage.setItem(VOLUME_STORAGE_KEY, clamped.toString());
  } catch {
    // Ignore error
  }
  if (scene && scene.sound) {
    scene.sound.setVolume(clamped / MAX_VOLUME_LEVEL);
  }
}

export function applyStoredVolume(scene: Phaser.Scene): number {
  const level = getStoredVolumeLevel();
  setGameVolumeLevel(scene, level);
  return level;
}
