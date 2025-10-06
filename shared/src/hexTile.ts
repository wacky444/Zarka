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
  walkable: boolean;
  numberMin: number; // Minimum number of this cell type per map
  numberMax: number;
}

export type Axial = { q: number; r: number };

export interface HexTileOptions {
  id?: string;
  frame?: string; // optional sprite frame name for client usage
  walkable?: boolean;
  meta?: Record<string, unknown>;
}

export interface HexTileSnapshot {
  id: string;
  coord: Axial;
  localizationType: LocalizationType;
  walkable: boolean;
  frame?: string;
  meta?: Record<string, unknown>;
}

export type CellLibraryDefinition = Record<LocalizationType, CellType>;

export class HexTile {
  readonly id: string;
  readonly coord: Axial;
  cellType: CellType;
  frame?: string;
  meta: Record<string, unknown>;

  constructor(coord: Axial, cellType: CellType, opts: HexTileOptions = {}) {
    this.id = opts.id ?? `hex_${coord.q}_${coord.r}`;
    this.coord = coord;
    const walkable = opts.walkable ?? cellType.walkable;
    this.cellType = { ...cellType, walkable };
    this.frame = opts.frame ?? cellType.sprite;
    this.meta = opts.meta ? { ...opts.meta } : {};
  }

  toSnapshot(): HexTileSnapshot {
    return {
      id: this.id,
      coord: { ...this.coord },
      localizationType: this.cellType.localizationType,
      walkable: this.cellType.walkable,
      frame: this.frame,
      meta: { ...this.meta },
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
    return new HexTile(snapshot.coord, base, {
      id: snapshot.id,
      frame: snapshot.frame ?? base.sprite,
      walkable: snapshot.walkable,
      meta: snapshot.meta ? { ...snapshot.meta } : {},
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
