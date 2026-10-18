// Какие виды меток карты мира показаны (владелец, 05.10.2026: «каждый элемент
// при нажатии должен вкл/выкл — касается именно объектов, типов местности не
// касается»; «по каждому зданию (поведение здания) нужно показать и дать
// возможность отфильтровать»). Тап по строке легенды прячет вид или
// возвращает его; «Все постройки» — все виды построек разом. Местность не
// выключается.
//
// Выбор помнится на устройстве (localStorage). Не прочиталось — приватный
// режим, мусор в записи — всё включено; не записалось — выбор живёт до
// закрытия вкладки.
import type { WorldMarkKind } from "@/lib/raid/worldMapCodec";

export type WorldLayer = WorldMarkKind | "hero" | "castle";

/**
 * Постройки в легенде по порядку: город и торговля, хозяйство, дороги,
 * услуги героям, магия, прочие. Каждое поведение постройки — своей строкой.
 */
export const BUILDING_LAYERS: readonly WorldMarkKind[] = [
  "town",
  "shop",
  "tavern",
  "mine",
  "field",
  "warehouse",
  "portal",
  "shipyard",
  "watchtower",
  "sign",
  "university",
  "museum",
  "chambers",
  "leveltree",
  "tournament",
  "boost",
  "spellbook",
  "oblivion",
  "other",
];

/** Строки легенды по порядку: своё сверху (герой, замок, клады), ниже постройки. */
export const WORLD_LAYERS: readonly WorldLayer[] = [
  "hero",
  "castle",
  "treasure",
  ...BUILDING_LAYERS,
];

const KEY = "beta-raid:world-map-hidden";

const isLayer = (v: unknown): v is WorldLayer => WORLD_LAYERS.includes(v as WorldLayer);

/** Запись на устройстве → выключенные виды; незнакомые и кривые значения — мимо. */
export function parseHidden(raw: string | null): ReadonlySet<WorldLayer> {
  if (!raw) return new Set();
  try {
    const list: unknown = JSON.parse(raw);
    return new Set(Array.isArray(list) ? list.filter(isLayer) : []);
  } catch {
    return new Set();
  }
}

export function loadHidden(): ReadonlySet<WorldLayer> {
  try {
    return parseHidden(window.localStorage.getItem(KEY));
  } catch {
    return new Set();
  }
}

export function saveHidden(hidden: ReadonlySet<WorldLayer>): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify([...hidden]));
  } catch {
    /* переполнено или запрещено — выбор живёт до закрытия вкладки */
  }
}

/** Тап по виду: был показан — прячем, был спрятан — показываем. */
export function toggleLayer(
  hidden: ReadonlySet<WorldLayer>,
  layer: WorldLayer,
): ReadonlySet<WorldLayer> {
  const next = new Set(hidden);
  if (next.has(layer)) next.delete(layer);
  else next.add(layer);
  return next;
}

/**
 * «Все постройки»: видна хоть одна постройка (anyOn) — прячем все виды
 * построек, иначе возвращаем все. Своё — герой, замок, клады — не трогаем.
 */
export function toggleBuildings(
  hidden: ReadonlySet<WorldLayer>,
  anyOn: boolean,
): ReadonlySet<WorldLayer> {
  const next = new Set(hidden);
  for (const k of BUILDING_LAYERS) {
    if (anyOn) next.add(k);
    else next.delete(k);
  }
  return next;
}

/** Сколько меток каждого вида в ответе: строка легенды — только у того, что есть на карте. */
export function countMarks(
  marks: ReadonlyArray<{ kind: WorldMarkKind }>,
): ReadonlyMap<WorldMarkKind, number> {
  const out = new Map<WorldMarkKind, number>();
  for (const m of marks) out.set(m.kind, (out.get(m.kind) ?? 0) + 1);
  return out;
}
