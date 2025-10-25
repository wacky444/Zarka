import { ActionId } from "./Action";
import type { ItemId } from "./Item";

export enum LocalizationType {
  House = "House",
  Pharmacy = "Pharmacy",
  PoliceStation = "PoliceStation",
  Hardware = "Hardware",
  Factory = "Factory",
  Hospital = "Hospital",
  Workshop = "Workshop",
  Security = "Security",
  GasStation = "GasStation",
  Market = "Market",
  Restaurant = "Restaurant",
  Road = "Road",
  Path = "Path",
  Alley = "Alley",
}

export interface CellType {
  sprite: string;
  localizationType: LocalizationType;
  specialActionIds?: ActionId[];
  walkable: boolean;
  numberMin: number; // Minimum number of this cell type per map
  numberMax: number;
  startingItems?: CellItemStock[];
}

export interface CellItemStock {
  itemId: ItemId;
  quantity: number;
}

export type Axial = { q: number; r: number };

export interface HexTileOptions {
  id?: string;
  frame?: string; // optional sprite frame name for client usage
  walkable?: boolean;
  meta?: Record<string, unknown>;
  currentItems?: CellItemStock[];
}

export interface HexTileSnapshot {
  id: string;
  coord: Axial;
  localizationType: LocalizationType;
  walkable: boolean;
  frame?: string;
  meta?: Record<string, unknown>;
  currentItems: CellItemStock[];
}

export type CellLibraryDefinition = Record<LocalizationType, CellType>;

export class HexTile {
  readonly id: string;
  readonly coord: Axial;
  cellType: CellType;
  frame?: string;
  meta: Record<string, unknown>;
  currentItems: CellItemStock[];

  constructor(coord: Axial, cellType: CellType, opts: HexTileOptions = {}) {
    this.id = opts.id ?? `hex_${coord.q}_${coord.r}`;
    this.coord = coord;
    const walkable = opts.walkable ?? cellType.walkable;
    this.cellType = { ...cellType, walkable };
    this.frame = opts.frame ?? cellType.sprite;
    this.meta = opts.meta ? { ...opts.meta } : {};
    const baseItems = Array.isArray(cellType.startingItems)
      ? cellType.startingItems
      : [];
    const initialItems = opts.currentItems ?? baseItems;
    this.currentItems = initialItems.map((stock) => ({ ...stock }));
  }

  toSnapshot(): HexTileSnapshot {
    return {
      id: this.id,
      coord: { ...this.coord },
      localizationType: this.cellType.localizationType,
      walkable: this.cellType.walkable,
      frame: this.frame,
      meta: { ...this.meta },
      currentItems: this.currentItems.map((stock) => ({ ...stock })),
    };
  }

  static fromSnapshot(
    snapshot: HexTileSnapshot,
    library: CellLibraryDefinition
  ): HexTile {
    const base = library[snapshot.localizationType];
    if (!base) {
      throw new Error(`Missing cell type for ${snapshot.localizationType}`);
    }
    const incoming = snapshot.currentItems as unknown;
    const items = Array.isArray(incoming)
      ? (incoming as CellItemStock[])
      : base.startingItems ?? [];
    return new HexTile(snapshot.coord, base, {
      id: snapshot.id,
      frame: snapshot.frame ?? base.sprite,
      walkable: snapshot.walkable,
      meta: snapshot.meta ? { ...snapshot.meta } : {},
      currentItems: items,
    });
  }
}

export function neighbors(ax: Axial): Axial[] {
  // pointy-top axial neighbors (E, NE, NW, W, SW, SE)
  const dirs: Axial[] = [
    { q: +1, r: 0 },
    { q: +1, r: -1 },
    { q: 0, r: -1 },
    { q: -1, r: 0 },
    { q: -1, r: +1 },
    { q: 0, r: +1 },
  ];
  return dirs.map((d) => ({ q: ax.q + d.q, r: ax.r + d.r }));
}

export interface GameMap {
  cols: number;
  rows: number;
  seed: string;
  tiles: HexTileSnapshot[];
}

const HEX_OFFSET_ANGLES = [-90, -30, 30, 90, 150, -150];

export function getHexTileOffsets(
  count: number,
  radius: number
): { x: number; y: number }[] {
  const safeRadius = radius > 0 ? radius : 1;
  if (count <= 1) {
    return [{ x: 0, y: 0 }];
  }
  const offsets: { x: number; y: number }[] = [];
  const maxSlots = HEX_OFFSET_ANGLES.length;
  for (let index = 0; index < count; index += 1) {
    const angle = HEX_OFFSET_ANGLES[index % maxSlots];
    const scale = 1 + Math.floor(index / maxSlots) * 0.5;
    const rad = (angle * Math.PI) / 180;
    offsets.push({
      x: Math.cos(rad) * safeRadius * scale,
      y: Math.sin(rad) * safeRadius * scale,
    });
  }
  return offsets;
}
