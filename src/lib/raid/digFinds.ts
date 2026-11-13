// Находки лопатой (владелец, 31.10.2026; ПРАВИЛА §8.24 п. 6б): «Копать» на
// пустой земле — бросок по списку долей, как улов рыбалки, только без времени:
// каждое нажатие — один шанс. В списке и «Ничего» — своей строкой со своей долей
// (владелец: «Ничего — 50 %»); сумма всегда ровно 100 %, пересчёт общий с
// рыбалкой (fishChances): поднял одному — остальные ужались пропорционально.
//
// Список один на все местности; у типа местности может быть свой (режим бога,
// окно клетки → строка «Местность») — тогда на клетках этой местности бросок
// идёт по нему.
import {
  normalizeFish,
  pickFish,
  withFishItem,
  withoutFishItem,
  type FishItem,
} from "@/lib/raid/fishChances";

/** Строка «Ничего» — не товар: выпала она — ничего не нашлось. */
export const DIG_NONE = "none";
/** Сколько строк в списке (с «Ничего»). */
export const DIG_FINDS_MAX = 20;

export type DigConfig = {
  /** Общий список — для всех местностей без своего. */
  items: FishItem[];
  /** Свои списки местностей: id шаблона местности → доли. */
  terrains: Record<string, FishItem[]>;
};

export const ITEM_RE = /^cst_[A-Za-z0-9_-]{1,40}$/;
export const TERRAIN_RE = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Доли из чего угодно: только «Ничего» и свои товары, без повторов. Непустой
 * список всегда с «Ничего» (не было — встаёт с нулём); сумма — ровно 100.
 */
export function parseDigItems(raw: unknown): FishItem[] {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  const out: FishItem[] = [];
  for (const x of list) {
    const o = x && typeof x === "object" ? (x as Record<string, unknown>) : null;
    const id = String(o?.id ?? "").trim();
    if ((id !== DIG_NONE && !ITEM_RE.test(id)) || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, pct: Number(o?.pct) || 0 });
    if (out.length >= DIG_FINDS_MAX) break;
  }
  if (out.length === 0) return [];
  if (!seen.has(DIG_NONE)) out.unshift({ id: DIG_NONE, pct: 0 });
  return normalizeFish(out.slice(0, DIG_FINDS_MAX));
}

/** Настройка из строки settings (текст JSON); мусор — пустая (ничего не находят). */
export function parseDigConfig(raw: unknown): DigConfig {
  let v: unknown = raw;
  if (typeof raw === "string") {
    try {
      v = JSON.parse(raw);
    } catch {
      v = null;
    }
  }
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const t = (o.terrains && typeof o.terrains === "object" ? o.terrains : {}) as Record<
    string,
    unknown
  >;
  const terrains: Record<string, FishItem[]> = {};
  for (const [id, list] of Object.entries(t)) {
    const items = parseDigItems(list);
    if (TERRAIN_RE.test(id) && items.length > 0) terrains[id] = items;
  }
  return { items: parseDigItems(o.items), terrains };
}

/** Список для клетки: свой у её местности, иначе общий. */
export const digListFor = (cfg: DigConfig, terrainId: string | null): FishItem[] =>
  (terrainId ? cfg.terrains[terrainId] : undefined) ?? cfg.items;

/** Что выкопали при броске 0…999: id товара или null («Ничего», список пуст). */
export function pickDigFind(items: readonly FishItem[], roll: number): string | null {
  const id = pickFish(items, roll);
  return id && id !== DIG_NONE ? id : null;
}

/** Добавить товар (равная доля, остальные ужались); пустой список — с «Ничего». */
export function withDigItem(items: readonly FishItem[], id: string): FishItem[] {
  const base = items.length > 0 ? items : [{ id: DIG_NONE, pct: 100 }];
  return base.length >= DIG_FINDS_MAX ? normalizeFish(base) : withFishItem(base, id);
}

/** Убрать товар — его доля расходится остальным. «Ничего» не убирается. */
export const withoutDigItem = (items: readonly FishItem[], id: string): FishItem[] =>
  id === DIG_NONE ? normalizeFish(items) : withoutFishItem(items, id);
