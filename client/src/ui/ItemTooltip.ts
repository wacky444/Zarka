import Phaser from "phaser";
import { HoverTooltip } from "./HoverTooltip";
import { t } from "../services/i18n";

export interface ItemTooltipPayload {
  name?: string;
  title?: string;
  description?: string | null;
  notes?: string[];
  weight?: number | null;
}

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

  show(
    x: number,
    y: number,
    title: string,
    body: string,
    weight?: number | null
  ): void {
    const hasWeight = weight !== undefined && weight !== null;
    if (!title && !body && !hasWeight) {
      return;
    }
    const tooltip = this.ensureTooltip();
    tooltip.show(x, y, { title, body, weight });
  }

  showItem(
    x: number,
    y: number,
    item: ItemTooltipPayload
  ): void {
    const rawTitle = item.title ?? item.name ?? "";
    const title = rawTitle ? t(rawTitle) : "";
    const description = item.description ? t(item.description) : "";
    const notes = item.notes?.map((note) => t(note));
    const body = composeItemDescription(description, notes);
    this.show(x, y, title, body, item.weight);
  }

  hide(): void {
    this.tooltip?.hide();
  }

  containsPoint(x: number, y: number): boolean {
    return this.tooltip?.containsPoint(x, y) ?? false;
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
