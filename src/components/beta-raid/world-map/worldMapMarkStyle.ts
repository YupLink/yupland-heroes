// Как выглядит каждый вид метки карты мира — одно описание на холст и легенду.
//
// Фигура — семейство, цвет — вид внутри него: шахта и дерево уровней —
// треугольники, лавка и таверна — круги, город, поле и склад — квадраты,
// вышка, верфь и табличка — ромбы, университет, музей и покои — шестиугольники,
// алтарь, столб заклинаний и «Забвение» — перевёрнутые треугольники; портал —
// кольцо, турнир — звезда, мой клад — крестик, как на карте сокровищ. Прочие
// постройки — серая точка поменьше. Герой — золотой круг, как на миникарте;
// замок — та же картинка, что на карте рейда и на кнопке замка.
import type { WorldMarkKind } from "@/lib/raid/worldMapCodec";
import type { MarkShape } from "./worldMapMarks";

export type MarkStyle = {
  shape: MarkShape;
  fill: string;
  /** Доля размера метки (прочие постройки мельче). */
  scale?: number;
};

export const MARK_STYLE: Readonly<Record<WorldMarkKind, MarkStyle>> = {
  mine: { shape: "tri", fill: "#d9891f" },
  leveltree: { shape: "tri", fill: "#3fbf6f" },
  shop: { shape: "dot", fill: "#4fd6e0" },
  tavern: { shape: "dot", fill: "#e05fd0" },
  other: { shape: "dot", fill: "#8b93a1", scale: 0.7 },
  town: { shape: "sq", fill: "#ececf5" },
  field: { shape: "sq", fill: "#a3d94f" },
  warehouse: { shape: "sq", fill: "#b07a45" },
  watchtower: { shape: "diamond", fill: "#f1e05a" },
  shipyard: { shape: "diamond", fill: "#4aa3ff" },
  sign: { shape: "diamond", fill: "#d9c8a8" },
  portal: { shape: "ring", fill: "#b57bff" },
  university: { shape: "hex", fill: "#7c8cff" },
  museum: { shape: "hex", fill: "#e8a85a" },
  chambers: { shape: "hex", fill: "#f28cb8" },
  boost: { shape: "triDown", fill: "#ff5a5f" },
  spellbook: { shape: "triDown", fill: "#a78bfa" },
  oblivion: { shape: "triDown", fill: "#36c5b0" },
  tournament: { shape: "star", fill: "#ffd23f" },
  treasure: { shape: "x", fill: "#e5484d" },
};

/**
 * Порядок слоёв меток снизу вверх: прочие и частые мелочи внизу, города над
 * постройками, мои клады — над всеми.
 */
export const MARK_ORDER: readonly WorldMarkKind[] = [
  "other",
  "sign",
  "field",
  "warehouse",
  "shipyard",
  "watchtower",
  "portal",
  "leveltree",
  "museum",
  "university",
  "chambers",
  "boost",
  "spellbook",
  "oblivion",
  "tavern",
  "tournament",
  "mine",
  "shop",
  "town",
  "treasure",
];

export const HERO_FILL = "#f5b301";
export const CASTLE_FILL = "#4fd6e0";
export const OUTLINE = "#0b0f18";
/** Фон карты мира — тот же «чёрный туман», что у неразведанного на карте рейда. */
export const WORLD_BG = "#10141c";

/** Размер метки на экране: растёт с приближением, но всегда видна и не раздувается. */
export function markSize(s: number): number {
  return Math.max(6, Math.min(14, s * 0.9));
}
