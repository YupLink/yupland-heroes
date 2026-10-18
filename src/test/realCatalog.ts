// Живой справочник построек (прод, 25.09.2026) и поле 30×30 с рекой и дорогой
// карты — для прогона placeTown «как на карте», а не на игрушечном срезе.
//
// 82 шаблона: рынков 22, порталов 15, без эффекта 8, полей 8, шахт 8, деревьев
// уровней 5, табличек 4, таверн 3 и по одному boost, shipyard, chambers,
// town_hall, university, warehouse, spellbook, watchtower, museum. Облики —
// группы владельца (raid_building_group → template_id), имя облика = тема.
import type { ZoneCell } from "@/lib/raid/zonegen/recipe";
import type { BuildingOption } from "@/lib/raid/zonegen/settlement-types";
import { hexLine, key } from "@/lib/raid/zonegen/town/hex";

const SIX = ["Юпик", "Кабан", "Дракон", "Единорог", "Виходка", "Пчела"];
/** Группа обликов шаблона: темы → облики с числовым id, как в базе. */
const GROUPS: Record<string, string[]> = {
  Лавка: [...SIX, "Северный"],
  Храм: [...SIX, "Северный", "Адский"],
  Казарма: [...SIX, "Адский"],
  Ратуша: SIX,
  Плавильня: SIX,
  Покои: [...SIX, "Морж"],
  Склад: [...SIX, "Северный"],
  Таверна: [...SIX, "Зимний"],
  Оружейная: SIX.slice(0, 5),
  Музей: SIX.slice(0, 5),
  Ворота: SIX.slice(0, 4),
  Портал: SIX.slice(0, 4),
  Казна: SIX.slice(0, 3),
  Шахта: ["Юпик", "Кабан"],
  Ферма: ["Юпик", "Кабан"],
};
let skinSeq = 100;
const skinsOf = (group: string | undefined) =>
  (group === undefined ? [] : GROUPS[group]).map((name) => ({ id: String(skinSeq++), name }));

let tplSeq = 0;
const t = (name: string, effect: string | null, tiers = 0, group?: string): BuildingOption => ({
  id: `tpl${String(tplSeq++).padStart(2, "0")}`,
  name,
  effect,
  tiers,
  needsConfig: effect !== null && ["mine", "field", "portal", "leveltree", "sign"].includes(effect),
  skins: skinsOf(group),
});

const MARKETS = [
  "Алхимия",
  "Конюшня",
  "Паки",
  "Продуктовый",
  "Путешественника",
  "Строительный",
  "Пекарня",
  "Пилорама",
  "Ювелирный",
  "Рыбный",
  "Кожевенный",
  "Травник",
  "Гончарный",
  "Ткацкий",
  "Книжный",
  "Зелья",
  "Свитки",
  "Мясной",
  "Цветочный",
  "Сырный",
];

export const REAL_CATALOG: BuildingOption[] = [
  ...MARKETS.map((m, i) => t(`${m} - Рынок`, "market", i % 3)),
  t("Казарма - Найм войнов", "market", 2, "Казарма"),
  t("Оружейный - Рынок", "market", 1, "Оружейная"),
  t("Ворота", "portal", 0, "Ворота"),
  t("Портал", "portal", 0, "Портал"),
  t("Грибной портал", "portal", 0),
  ...Array.from({ length: 12 }, (_, i) => t(`Портал ${i + 2}`, "portal")),
  t("Арена", null),
  t("Кузница", null),
  t("Лавка", null, 0, "Лавка"),
  t("Ломбард", null),
  t("Плавильня", null, 0, "Плавильня"),
  t("Ратуша", null),
  t("Ратуша", null),
  t("Храм", null),
  t("Ферма", "field", 0, "Ферма"),
  ...Array.from({ length: 7 }, (_, i) => t(`Поле ${i + 2}`, "field")),
  t("Золотая шахта", "mine", 2, "Шахта"),
  t("Алмазная шахта", "mine", 2),
  t("Банк", "mine", 1, "Казна"),
  ...Array.from({ length: 5 }, (_, i) => t(`Шахта ${i + 2}`, "mine")),
  ...Array.from({ length: 5 }, (_, i) => t(`Древо ${i + 1}`, "leveltree")),
  t("Табличка", "sign"),
  ...Array.from({ length: 3 }, (_, i) => t(`Табличка ${i + 2}`, "sign")),
  t("Таверна", "tavern", 3, "Таверна"),
  t("Бар", "tavern"),
  t("Трактир", "tavern", 1),
  t("Храм", "boost", 2, "Храм"),
  t("Верфь", "shipyard", 3),
  t("Покои", "chambers", 2, "Покои"),
  t("Ратуша", "town_hall", 3, "Ратуша"),
  t("Университет", "university", 3),
  t("Склад", "warehouse", 2, "Склад"),
  t("Столб заклинаний", "spellbook", 1),
  t("Обзорная вышка", "watchtower", 2),
  t("Музей", "museum", 4, "Музей"),
];

/** Смещённая сетка 30×30 (pointy-top, x = q + r/2): ряд r, колонка x. */
export const axial = (x: number, r: number): ZoneCell => ({ q: x - Math.floor(r / 2), r });
export const FIELD = 30;

/** Поле 30×30: река по южному краю (3–4 ряда), дорога карты с запада на восток. */
export function realField(): { cells: ZoneCell[]; water: Set<string>; mapRoads: Set<string> } {
  const cells: ZoneCell[] = [];
  const water = new Set<string>();
  for (let r = 0; r < FIELD; r++) {
    for (let x = 0; x < FIELD; x++) {
      const c = axial(x, r);
      cells.push(c);
      // Берег чуть гуляет: река шириной 3–4 ряда, как на живой карте.
      if (r >= 26 + ((x >> 3) % 2)) water.add(key(c.q, c.r));
    }
  }
  // Дорога карты входит с запада (за 6 клеток до края) и уходит на северо-восток.
  const pts = [axial(-6, 14), axial(8, 13), axial(18, 10), axial(35, 4)];
  const mapRoads = new Set<string>();
  for (let i = 0; i + 1 < pts.length; i++) {
    for (const c of hexLine(pts[i], pts[i + 1])) mapRoads.add(key(c.q, c.r));
  }
  return { cells, water, mapRoads };
}
