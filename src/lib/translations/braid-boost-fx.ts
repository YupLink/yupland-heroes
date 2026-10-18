import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Переводы новых эффектов буста: Торговля и Алхимия как временная прибавка и
// иммунитет к дебаффу (зелья, заклинания, алтари). Отдельный файл —
// braid-castle.ts уже за лимитом строк.
export const dict: Record<string, Entry> = {
  "braid.buff_trade": { ru: "Буст: Торговля", en: "Boost: Trade" },
  "braid.buff_alchemy": { ru: "Буст: Алхимия", en: "Boost: Alchemy" },
  "braid.immune_to": { ru: "Иммунитет: {name}", en: "Immunity: {name}" },
  "braid.immune_all": { ru: "все дебаффы", en: "all debuffs" },
  // Забвение (boostOblivion.ts): заряды, заряды со сроком, без счёта на время.
  "braid.oblivion": { ru: "Забвение", en: "Oblivion" },
  "braid.oblivion_lv": { ru: "Забвение {n} Lv", en: "Oblivion {n} Lv" },
  "braid.oblivion_lv_min": { ru: "Забвение {n} Lv на {m} мин", en: "Oblivion {n} Lv for {m} min" },
  "braid.oblivion_min": { ru: "Забвение на {n} мин", en: "Oblivion for {n} min" },
};
