import type { Lang } from "../store";
type Entry = Record<Lang, string>;

// Сверка порталов (/portal-check): страница только на чтение для Ангелины и админов.
export const dict: Record<string, Entry> = {
  "pcheck.title": { ru: "Сверка порталов", en: "Portal check" },
  "pcheck.total": { ru: "Порталов: {n}", en: "Portals: {n}" },
  "pcheck.doors": { ru: "двери {n}", en: "doors {n}" },
  "pcheck.closed": { ru: "этаж закрыт {n}", en: "floor closed {n}" },
  "pcheck.alone": { ru: "без пары {n}", en: "no pair {n}" },
  "pcheck.inner": { ru: "внутри мира {n}", en: "within world {n}" },
  "pcheck.cross": { ru: "межмировых {n}", en: "interworld {n}" },
  "pcheck.col_entry": { ru: "Вход", en: "Entrance" },
  "pcheck.col_block": { ru: "Клетки блока", en: "Block cells" },
  "pcheck.col_to": { ru: "Куда", en: "Leads to" },
  "pcheck.col_seen": { ru: "Видят", en: "Seen by" },
  "pcheck.seen": { ru: "{a} из {b}", en: "{a} of {b}" },
  "pcheck.also_here": { ru: "и в этот мир", en: "also this world" },
  "pcheck.void": { ru: "глухой туман", en: "void fog" },
  "pcheck.islands": { ru: "Острова новичка: {n} → {to}", en: "Newbie islands: {n} → {to}" },
  "pcheck.loading": { ru: "Загружаем…", en: "Loading…" },
  "pcheck.error": { ru: "Не загрузилось", en: "Failed to load" },
};
