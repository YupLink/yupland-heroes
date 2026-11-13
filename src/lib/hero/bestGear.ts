// Лучший набор артефактов для героя. Чистый модуль — ни БД, ни сети: его
// одинаково считают сервер (кнопка «надеть лучшее») и проверочный скрипт.
//
// Цену предмета даёт explainGear, а не stat_amount на шаблоне: расовая и
// профессиональная прибавки достаются НЕ каждому герою, и «Маг +7» на Воине
// стоит ноль — считать по надписи значит обещать прирост, которого не будет.
//
// Метрика — сумма характеристик с предметов: шесть боевых + Торговля и Алхимия.
// Грубо (броня весит как здоровье), зато это те цифры, на которые игрок смотрит
// в окне героя. Без Торговли (12.11.2026) кнопка меняла «Торговля +16» на
// «Скорость +8» и обещала «+8»: небоевой стат она считала нулём.
import { HERO_STAT_KEYS, type HeroStats } from "@/lib/heroStats";
import type { HeroSlotDef } from "./heroSlots";
import {
  IMMUNITY_TO_EFFECT,
  explainGear,
  sumGearStats,
  type GearCtx,
  type GearPiece,
  type HeroImmunity,
} from "./heroStatSources";

/** Артефакт-кандидат: то же, что рисует экран экипировки, но id обязателен. */
export type BestGearItem = GearPiece & { itemId: string };

export type BestGearInput = {
  /** Места героя по редкости — heroSlots(rarity). */
  slots: HeroSlotDef[];
  /** ВСЕ артефакты аккаунта, включая уже надетые: надетое тоже кандидат. */
  items: BestGearItem[];
  /** Что надето сейчас: место → id предмета. */
  equipped: Record<string, string>;
  ctx: GearCtx;
};

export type BestGearResult = {
  /** Лучшая раскладка: место → id предмета. Пустых мест в объекте нет. */
  equip: Record<string, string>;
  /** Вклад лучшего набора в характеристики. */
  stats: HeroStats;
  /** Вклад того, что надето сейчас. */
  current: HeroStats;
  /** На сколько вырастет сумма шести характеристик. 0 — уже надето лучшее. */
  gain: number;
  /** Сколько мест поменяется. */
  changed: number;
};

/** Сумма шести характеристик — метрика «лучше/хуже». */
export const statsTotal = (s: HeroStats): number =>
  HERO_STAT_KEYS.reduce((acc, k) => acc + (Number.isFinite(s[k]) ? s[k] : 0), 0);

/** Предмет с посчитанной ценой для ЭТОГО героя. */
type Scored = {
  it: BestGearItem;
  /** Сколько характеристик достанется герою: 0 — предмет пустой. */
  score: number;
  immune: HeroImmunity[];
  /** Уже надет — при равном счёте остаётся на месте, чтобы не гонять UPDATE. */
  worn: boolean;
};

function score(it: BestGearItem, ctx: GearCtx, worn: boolean): Scored {
  const b = explainGear(it, ctx);
  const immune: HeroImmunity[] = [];
  for (const raw of it.immunities ?? []) {
    const eff = IMMUNITY_TO_EFFECT[(raw ?? "").trim()];
    if (eff && !immune.includes(eff)) immune.push(eff);
  }
  return { it, score: b.key || b.extra ? b.total : 0, immune, worn };
}

/** Кто раньше в очереди за местом: больше статов → больше защит → уже надет. */
function cmp(a: Scored, b: Scored): number {
  if (a.score !== b.score) return b.score - a.score;
  if (a.immune.length !== b.immune.length) return b.immune.length - a.immune.length;
  if (a.worn !== b.worn) return a.worn ? -1 : 1;
  return a.it.itemId < b.it.itemId ? -1 : 1;
}

/** Места по ТИПУ слота: у лега карманов пять, и они конкурируют между собой. */
function keysByType(slots: HeroSlotDef[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const d of slots) {
    const arr = out.get(d.slot);
    if (arr) arr.push(d.key);
    else out.set(d.slot, [d.key]);
  }
  return out;
}

/**
 * Раскладка мест этого типа: кандидат берётся из списка один раз, поэтому один
 * экземпляр не займёт два кармана.
 *
 * Проходов два, а не одна сортировка. Часть артефактов даёт только иммунитет и
 * ноль статов: по метрике они равны пустому месту и при общей сортировке могли
 * бы вытеснить предмет со статами. Поэтому места сперва забирают те, кто даёт
 * числа, а свободные достаются защитам — и только новым: иммунитет отменяет
 * способность босса целиком, второй такой же не даёт ничего.
 */
function statPass(list: Scored[], places: number, covered: Set<HeroImmunity>): BestGearItem[] {
  const take = [...list]
    .sort(cmp)
    .filter((c) => c.score > 0)
    .slice(0, places);
  for (const c of take) for (const im of c.immune) covered.add(im);
  return take.map((c) => c.it);
}

/**
 * Второй проход: свободные места достаются защитам — и только НОВЫМ. Идёт по
 * всем типам сразу, а не внутри одного: покрытие общее, и «Голова» не должна
 * съедать иммунитет раньше, чем до «Тела» дошла очередь. Условие score !== 0,
 * а не score > 0: предмет с отрицательным вкладом не надеваем даже ради новой
 * защиты — общий guard по приросту его бы не поймал, если остальные места в плюсе.
 */
function immunityPass(list: Scored[], free: number, covered: Set<HeroImmunity>, used: Set<string>) {
  const out: BestGearItem[] = [];
  for (const c of [...list].sort(cmp)) {
    if (out.length >= free) break;
    if (used.has(c.it.itemId) || c.score !== 0 || c.immune.length === 0) continue;
    if (c.immune.every((im) => covered.has(im))) continue;
    for (const im of c.immune) covered.add(im);
    used.add(c.it.itemId);
    out.push(c.it);
  }
  return out;
}

/**
 * Разложить выбранное по конкретным местам. Что уже лежит правильно — там и
 * остаётся: перекладывать одинаковые кольца между пальцами — писать в базу зря.
 */
function place(keys: string[], chosen: BestGearItem[], equipped: Record<string, string>) {
  const rest = [...chosen];
  const out: Array<[string, string]> = [];
  const free: string[] = [];
  for (const k of keys) {
    const at = rest.findIndex((i) => i.itemId === equipped[k]);
    if (at >= 0) out.push([k, rest.splice(at, 1)[0].itemId]);
    else free.push(k);
  }
  for (const k of free) {
    const it = rest.shift();
    if (!it) break;
    out.push([k, it.itemId]);
  }
  return out;
}

/** Сумма всех прибавок набора — шесть боевых плюс Торговля и Алхимия. */
function gearTotal(gear: GearPiece[], ctx: GearCtx): number {
  let sum = 0;
  for (const it of gear) {
    const b = explainGear(it, ctx);
    if ((b.key || b.extra) && Number.isFinite(b.total)) sum += b.total;
  }
  return sum;
}

/** Лучший набор для героя и насколько он лучше текущего. */
export function bestGearFor(input: BestGearInput): BestGearResult {
  const { ctx, equipped } = input;
  const keys = keysByType(input.slots);
  // Дубли по id возможны: надетое приезжает и списком инвентаря, и отдельным
  // запросом под героя. Один экземпляр в двух списках дал бы два места.
  const byId = new Map<string, BestGearItem>();
  for (const it of input.items) if (!byId.has(it.itemId)) byId.set(it.itemId, it);
  const worn = new Set(input.slots.map((d) => equipped[d.key]).filter(Boolean));

  const pool = new Map<string, Scored[]>();
  for (const it of byId.values()) {
    const slot = (it.slot ?? "").trim();
    if (!keys.has(slot)) continue; // герою некуда надеть — предмет вне отбора
    const s = score(it, ctx, worn.has(it.itemId));
    const arr = pool.get(slot);
    if (arr) arr.push(s);
    else pool.set(slot, [s]);
  }

  const covered = new Set<HeroImmunity>();
  const used = new Set<string>();
  // Первый проход по ВСЕМ типам: места забирают предметы, дающие числа.
  const picked = new Map<string, BestGearItem[]>();
  for (const [slot, slotKeys] of keys) {
    const chosen = statPass(pool.get(slot) ?? [], slotKeys.length, covered);
    for (const it of chosen) used.add(it.itemId);
    picked.set(slot, chosen);
  }
  // Второй — тоже по всем типам: свободные места достаются новым защитам.
  for (const [slot, slotKeys] of keys) {
    const chosen = picked.get(slot) ?? [];
    const free = slotKeys.length - chosen.length;
    if (free > 0) chosen.push(...immunityPass(pool.get(slot) ?? [], free, covered, used));
  }
  const equip: Record<string, string> = {};
  for (const [slot, slotKeys] of keys) {
    for (const [k, id] of place(slotKeys, picked.get(slot) ?? [], equipped)) equip[k] = id;
  }

  const wear = (m: Record<string, string>): GearPiece[] =>
    input.slots.map((d) => byId.get(m[d.key] ?? "")).filter((p): p is BestGearItem => !!p);
  const current = sumGearStats(wear(equipped), ctx).stats;
  const stats = sumGearStats(wear(equip), ctx).stats;
  const gain = gearTotal(wear(equip), ctx) - gearTotal(wear(equipped), ctx);

  // Отрицательный прирост возможен только на кривых данных (предмет лежит в
  // месте чужого типа и всё-таки считается). Ухудшать героя кнопка не должна.
  if (gain < 0) return { equip: { ...equipped }, stats: current, current, gain: 0, changed: 0 };

  const same = (d: HeroSlotDef) => (equip[d.key] ?? "") === (equipped[d.key] ?? "");
  const changed = input.slots.filter((d) => !same(d)).length;
  return { equip, stats, current, gain, changed };
}
