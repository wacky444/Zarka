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
}

export type Axial = { q: number; r: number };

export interface HexTileOptions {
  id?: string;
  frame?: string; // optional sprite frame name for client usage
  walkable?: boolean;
  meta?: Record<string, unknown>;
}

export class HexTile {
  readonly id: string;
  readonly coord: Axial;
  cellType: CellType;
  frame?: string;
  walkable: boolean;
  meta: Record<string, unknown>;

  constructor(coord: Axial, cellType: CellType, opts: HexTileOptions = {}) {
    this.id = opts.id ?? `hex_${coord.q}_${coord.r}`;
    this.coord = coord;
    this.cellType = cellType;
    this.frame = opts.frame;
    this.walkable = opts.walkable ?? true;
    this.meta = opts.meta ?? {};
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
