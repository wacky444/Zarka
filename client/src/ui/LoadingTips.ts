import { t } from "../services/i18n";

export const LOADING_TIPS: readonly string[] = [
  "Don't attack randomly, you could be hitting your teammates",
  "Avoid crowded areas",
  "If your health drops to 5 or less, you become unconscious, you become invulnerable (fire, bombard, c4, rocket and virus still damage you)",
  "After being unconscious your max health becomes 5",
  "Same actions of different players are resolved in a random order, unless one player has more agility 2",
  "Put trusted people in your testament, you never know if you will survive one more turn",
  "The virus doesn't damage the carrier, if you don't mind being away from your teammates, it can be a good idea to sniff some vials",
  "When you are overweight, the less valuable items from your inventory will be dropped at the end of the turn"
] as const;

export function getRandomLoadingTipKey(): string {
  const index = Math.floor(Math.random() * LOADING_TIPS.length);
  return LOADING_TIPS[index];
}

export function getRandomLoadingTip(): string {
  const tipKey = getRandomLoadingTipKey();
  return `${t("Tip:")} ${t(tipKey)}`;
}
