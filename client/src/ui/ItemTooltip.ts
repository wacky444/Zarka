import Phaser from "phaser";
import { HoverTooltip } from "./HoverTooltip";

export function composeItemDescription(
  description: string,
  notes?: string[]
): string {
  const base =
    description && description.length > 0
      ? description
      : "Description not available.";
  if (!Array.isArray(notes) || notes.length === 0) {
    return base;
  }
  return `${base}\n\n${notes.join("\n")}`;
}

export class ItemTooltipManager {
  private tooltip: HoverTooltip | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly depth = 10005
  ) {}

  show(x: number, y: number, title: string, body: string): void {
    if (!title && !body) {
      return;
    }
    const tooltip = this.ensureTooltip();
    tooltip.show(x, y, { title, body });
  }

  hide(): void {
    this.tooltip?.hide();
  }

  destroy(): void {
    if (this.tooltip) {
      this.tooltip.destroy();
      this.tooltip = null;
    }
  }

  private ensureTooltip(): HoverTooltip {
    if (!this.tooltip) {
      this.tooltip = new HoverTooltip(this.scene);
      this.tooltip.getGameObject().setDepth(this.depth);
    }
    return this.tooltip;
  }
}
