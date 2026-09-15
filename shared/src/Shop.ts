export type ShopId =
  | "trafficker_arrow"
  | "trafficker_antidote"
  | "trafficker_bullet"
  | "trafficker_food"
  | "trafficker_bandage"
  | "trafficker_harpoon"
  | "trafficker_trap"
  | "trafficker_pistol"
  | "trafficker_c4"
  | "trafficker_vest"
  | "trafficker_rocket_launcher"
  | "security_camera_app"
  | "spy_drone"
  | "detective"
  | "tracking_app"
  | "helicopter"
  | "fumigator"
  | "pyromaniac"
  | "bomber"
  | "hitman"
  | "cocoman";

export interface ShopDefinition {
  id: ShopId;
  name: string;
  description: string;
  cost: number;
  costLabel?: string;
  implemented: boolean;
  category?: string;
}

export type ShopLibraryDefinition = Record<ShopId, ShopDefinition>;
