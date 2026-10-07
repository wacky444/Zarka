import Phaser from "phaser";
import { assetPath } from "../utils/assetPath";
import { isBackgroundAudioSuspended } from "../services/mobileAudioLifecycle";

export interface PlaySoundOptions {
  volume?: number;
  pitchRange?: number;
  rateRange?: number;
}

export const SOUND_ASSET_FILES: Record<string, string[]> = {
  punch: ["punch.ogg", "punch.mp3"],
  punch_2: ["punch_2.ogg", "punch_2.mp3"],
  punch_3: ["punch_3.ogg", "punch_3.mp3"],
  sword_slice: ["sword_slice.ogg", "sword_slice.mp3"],
  swipe: ["swipe.ogg", "swipe.mp3"],
  crunch_quick: ["crunch_quick.ogg", "crunch_quick.mp3"],
  harsh_thud: ["harsh_thud.ogg", "harsh_thud.mp3"],
  cardboard_hit: ["cardboard_hit.ogg", "cardboard_hit.mp3"],
  metal_blunt_tap: ["metal_blunt_tap.ogg", "metal_blunt_tap.mp3"],
  sword_light: ["sword_light.ogg", "sword_light.mp3"],
  cork_stabbed: ["cork_stabbed.ogg", "cork_stabbed.mp3"],
  sword_sharpen: ["sword_sharpen.ogg", "sword_sharpen.mp3"],
  foley_footstep_concrete_1: [
    "foley_footstep_concrete_1.ogg",
    "foley_footstep_concrete_1.mp3",
  ],
  foley_footstep_concrete_2: [
    "foley_footstep_concrete_2.ogg",
    "foley_footstep_concrete_2.mp3",
  ],
  foley_footstep_concrete_3: [
    "foley_footstep_concrete_3.ogg",
    "foley_footstep_concrete_3.mp3",
  ],
  foley_footstep_concrete_4: [
    "foley_footstep_concrete_4.ogg",
    "foley_footstep_concrete_4.mp3",
  ],
  weapon_pick_up: ["weapon_pick_up.ogg", "weapon_pick_up.mp3"],
  item_equip: ["item_equip.ogg", "item_equip.mp3"],
  wood_small_pickup: ["wood_small_pickup.ogg", "wood_small_pickup.mp3"],
  weapon_drop: ["weapon_drop.ogg", "weapon_drop.mp3"],
  wood_small_drop: ["wood_small_drop.ogg", "wood_small_drop.mp3"],
  cardboard_drop: ["cardboard_drop.ogg", "cardboard_drop.mp3"],
  page_turn: ["page_turn.ogg", "page_turn.mp3"],
  paper_move: ["paper_move.ogg", "paper_move.mp3"],
  paper_scrunch: ["paper_scrunch.ogg", "paper_scrunch.mp3"],
  munching_food: ["munching_food.ogg", "munching_food.mp3"],
  drink_slurp: ["drink_slurp.ogg", "drink_slurp.mp3"],
  clothing_1: ["clothing_1.ogg", "clothing_1.mp3"],
  clothing_2: ["clothing_2.ogg", "clothing_2.mp3"],
  paper_tear_1: ["paper_tear_1.ogg", "paper_tear_1.mp3"],
  power_up: ["power_up.ogg", "power_up.mp3"],
  power_up_2: ["power_up_2.ogg", "power_up_2.mp3"],
  heart_collect: ["heart_collect.ogg", "heart_collect.mp3"],
  whoosh_1: ["whoosh_1.ogg", "whoosh_1.mp3"],
  whoosh_2: ["whoosh_2.ogg", "whoosh_2.mp3"],
  air_burst: ["air_burst.ogg", "air_burst.mp3"],
  sword_clash: ["sword_clash.ogg", "sword_clash.mp3"],
  sword_clash_2: ["sword_clash_2.ogg", "sword_clash_2.mp3"],
  metal_clang: ["metal_clang.ogg", "metal_clang.mp3"],
  horror_sting: ["horror_sting.ogg", "horror_sting.mp3"],
  ghost: ["ghost.ogg", "ghost.mp3"],
  ghost_long: ["ghost_long.ogg", "ghost_long.mp3"],
  sci_fi_hover: ["sci_fi_hover.ogg", "sci_fi_hover.mp3"],
  sci_fi_select: ["sci_fi_select.ogg", "sci_fi_select.mp3"],
  pop_1: ["pop_1.ogg", "pop_1.mp3"],
  squelching_1: ["squelching_1.ogg", "squelching_1.mp3"],
  squelching_2: ["squelching_2.ogg", "squelching_2.mp3"],
  water_splashing: ["water_splashing.ogg", "water_splashing.mp3"],
  lose: ["lose.ogg", "lose.mp3"],
  "8_bit_defeated": ["8_bit_defeated.ogg", "8_bit_defeated.mp3"],
  hurt: ["hurt.ogg", "hurt.mp3"],
  undesired_effect: ["undesired_effect.ogg", "undesired_effect.mp3"],
  sci_fi_error: ["sci_fi_error.ogg", "sci_fi_error.mp3"],
  cancel: ["cancel.ogg", "cancel.mp3"],
  explosion_small: ["explosion_small.ogg", "explosion_small.mp3"],
  explosion_medium: ["explosion_medium.ogg", "explosion_medium.mp3"],
  explosion_large: ["explosion_large.ogg", "explosion_large.mp3"],
  wobble: ["wobble.ogg", "wobble.mp3"],
  snap: ["snap.ogg", "snap.mp3"],
  bone_snap: ["bone_snap.ogg", "bone_snap.mp3"],
  lock_quick: ["lock_quick.ogg", "lock_quick.mp3"],
  fire_lighting: ["fire_lighting.ogg", "fire_lighting.mp3"],
  shot_muffled: ["shot_muffled.ogg", "shot_muffled.mp3"],
  air_pump: ["air_pump.ogg", "air_pump.mp3"],
  gurgling: ["gurgling.ogg", "gurgling.mp3"],
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
  refuel: ["air_pump", "gurgling"],
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
  for (const [key, filenames] of Object.entries(SOUND_ASSET_FILES)) {
    if (!scene.cache.audio.exists(key)) {
      scene.load.audio(
        key,
        filenames.map((filename) => assetPath(`assets/sounds/${filename}`))
      );
    }
  }
}

export function playRandomSound(
  scene: Phaser.Scene,
  soundKeys: string | string[],
  options?: PlaySoundOptions
): void {
  if (!scene || !scene.sound || isBackgroundAudioSuspended()) {
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

export const MUSIC_STORAGE_KEY = "zarka_music_enabled";
export const DIRT_CITY_MUSIC_KEY = "music-dirt-city";

export function isMusicEnabled(): boolean {
  try {
    const raw = localStorage.getItem(MUSIC_STORAGE_KEY);
    if (raw !== null) {
      return raw === "true";
    }
  } catch {
    return true;
  }
  return true;
}

export function setMusicEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(MUSIC_STORAGE_KEY, enabled ? "true" : "false");
  } catch {
    // Ignore error
  }
}

export function preloadMenuMusic(scene: Phaser.Scene): void {
  if (!scene.cache.audio.exists(DIRT_CITY_MUSIC_KEY)) {
    scene.load.audio(
      DIRT_CITY_MUSIC_KEY,
      encodeURI(assetPath("assets/music/Dirt City.mp3"))
    );
  }
}

export function playMenuMusic(scene: Phaser.Scene): void {
  if (
    !scene ||
    !scene.sound ||
    isBackgroundAudioSuspended() ||
    !isMusicEnabled()
  ) {
    return;
  }
  if (!scene.cache.audio.exists(DIRT_CITY_MUSIC_KEY)) {
    if (scene.load.isLoading()) {
      scene.load.once(Phaser.Loader.Events.COMPLETE, () => {
        playMenuMusic(scene);
      });
    }
    return;
  }

  applyStoredVolume(scene);
  let music = scene.sound.get(DIRT_CITY_MUSIC_KEY);
  if (!music) {
    music = scene.sound.add(DIRT_CITY_MUSIC_KEY, {
      loop: true,
      volume: 1
    });
  } else if ("setVolume" in music) {
    (music as Phaser.Sound.WebAudioSound).setVolume(1);
  }

  if (music.isPaused) {
    music.resume();
  } else if (!music.isPlaying) {
    music.play();
  }
}

export function pauseMenuMusic(scene: Phaser.Scene): void {
  if (!scene || !scene.sound) {
    return;
  }
  const music = scene.sound.get(DIRT_CITY_MUSIC_KEY);
  if (music && music.isPlaying) {
    music.pause();
  }
}

export function stopMenuMusic(scene: Phaser.Scene): void {
  if (!scene || !scene.sound) {
    return;
  }
  const music = scene.sound.get(DIRT_CITY_MUSIC_KEY);
  if (music && (music.isPlaying || music.isPaused)) {
    music.stop();
  }
}

export function cleanupMenuMusic(scene: Phaser.Scene): void {
  if (!scene || !scene.sound) {
    return;
  }
  const music = scene.sound.get(DIRT_CITY_MUSIC_KEY);
  if (music) {
    music.stop();
    scene.sound.remove(music);
  }
}
