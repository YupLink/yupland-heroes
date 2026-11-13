import type { Lang } from "@/lib/store";
type Entry = Record<Lang, string>;

// Конь героя (§8.84, lib/hero/mount): строка карточки, отказы прыжка пегаса.
export const dict: Record<string, Entry> = {
  "mount.speed": { ru: "Скорость на карте {x}", en: "Map speed {x}" },
  "mount.jump": { ru: "прыжок через клетку ⚡{n}", en: "jumps over a cell ⚡{n}" },
  "braid.jump_water": {
    ru: "На воду не прыгают — только кораблём",
    en: "Can't jump onto water — ships only",
  },
  "braid.jump_ship": {
    ru: "С корабля не прыгают — сначала сойди на берег",
    en: "Can't jump from a ship — go ashore first",
  },
};
