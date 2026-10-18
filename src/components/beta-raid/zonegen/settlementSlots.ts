// Состав поселения: сколько каких построек поставить и чем добить остаток.
//
// Было «вес жребия (0–100) + потолок»: владелец 22.09.2026 спросил, что значат
// «40» и «2» — и был прав. В деревне никто не тянет жребий: ратуша одна,
// таверна одна, склад один, остальное — дворы. Поэтому строка состава теперь
// читается вслух: «Ратуша — 1 шт», «Пекарня — в фон».
//
// Чистая арифметика без React: её гоняет тест, а список остаётся про разметку.
import type {
  BuildingOption,
  SettlementPreset,
  SettlementSlot,
} from "@/lib/raid/zonegen/settlement-types";
import { composeSettlement } from "@/lib/raid/zonegen/settlement-compose";

/**
 * Строка состава — тип из схемы рецепта, а не его копия: разъехавшийся с zod
 * тип это ошибка не на экране, а на сервере. Ре-экспорт нужен, чтобы список и
 * строка тянули состав из одного места.
 */
export type { SettlementSlot };

/** Потолок строк состава — как в settlementRecipeSchema. */
export const MAX_SLOTS = 60;
/** Потолок поля «шт» — как в settlementSlotSchema. */
export const MAX_COUNT = 50;
/** Новая галочка — одна штука: ратуша одна, таверна одна, склад один. */
export const DEFAULT_COUNT = 1;

/**
 * Порядок групп в списке: сверху то, из чего состоит жилой квартал, снизу —
 * то, что стоит в поселении в одиночку (ратуша, портал, шахта). «Просто дом»
 * идёт первым: из дворов и состоит город.
 */
const EFFECT_ORDER = [
  "none",
  "market",
  "tavern",
  "university",
  "museum",
  "warehouse",
  "chambers",
  "boost",
  "spellbook",
  "leveltree",
  "watchtower",
  "shipyard",
  "sign",
  "town_hall",
  "field",
  "mine",
  "portal",
];

/** Эффект → ключ словаря; null (просто дом) — отдельный ключ. */
export const effectKey = (effect: string | null): string => `zonegen.eff_${effect ?? "none"}`;

/** Поиск по имени и по id: 82 шаблона глазами не перебрать. */
export function matchBuilding(b: BuildingOption, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return b.name.toLowerCase().includes(q) || b.id.toLowerCase().includes(q);
}

/** Группы «поведение → постройки», в порядке EFFECT_ORDER; хвост — по алфавиту. */
export function groupByEffect(
  buildings: BuildingOption[],
): Array<{ effect: string | null; items: BuildingOption[] }> {
  const groups = new Map<string, BuildingOption[]>();
  for (const b of buildings) {
    const key = b.effect ?? "none";
    const bucket = groups.get(key);
    if (bucket) bucket.push(b);
    else groups.set(key, [b]);
  }
  const rank = (key: string) => {
    const at = EFFECT_ORDER.indexOf(key);
    return at < 0 ? EFFECT_ORDER.length : at;
  };
  return [...groups.entries()]
    .sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]))
    .map(([key, items]) => ({
      effect: key === "none" ? null : key,
      items: [...items].sort((x, y) => x.name.localeCompare(y.name)),
    }));
}

export const slotFor = (slots: SettlementSlot[], buildingId: string): SettlementSlot | undefined =>
  slots.find((s) => s.buildingId === buildingId);

/** Целое в границах схемы: из поля ввода приходит что угодно, вплоть до «e». */
const clampCount = (n: number): number =>
  Number.isFinite(n) ? Math.min(MAX_COUNT, Math.max(0, Math.round(n))) : 0;

/**
 * Сколько штук этой постройки ставить в каждом поселении.
 *
 * Нулём строку не заводим: «поставить ноль штук и в фон не класть» — это та же
 * снятая галочка, только занимающая место в потолке рецепта.
 */
export function setCount(
  slots: SettlementSlot[],
  buildingId: string,
  count: number,
): SettlementSlot[] {
  const n = clampCount(count);
  const at = slots.findIndex((s) => s.buildingId === buildingId);
  if (at >= 0) return slots.map((s, i) => (i === at ? { ...s, count: n } : s));
  if (n <= 0 || slots.length >= MAX_SLOTS) return slots;
  return [...slots, { buildingId, count: n }];
}

/**
 * «Фон» — добивать остаток пятна этой постройкой (дворы, лавки).
 *
 * Новая строка заводится с нулём: включили фон у невыбранной постройки —
 * значит она нужна только в фон, обязательных штук у неё нет.
 */
export function setFill(
  slots: SettlementSlot[],
  buildingId: string,
  fill: boolean,
): SettlementSlot[] {
  const at = slots.findIndex((s) => s.buildingId === buildingId);
  if (at >= 0) return slots.map((s, i) => (i === at ? { ...s, fill } : s));
  if (!fill || slots.length >= MAX_SLOTS) return slots;
  return [...slots, { buildingId, count: 0, fill: true }];
}

/** Убрать постройку из состава: снятая галочка своих чисел не хранит. */
export const dropSlot = (slots: SettlementSlot[], buildingId: string): SettlementSlot[] =>
  slots.filter((s) => s.buildingId !== buildingId);

/** Строки, которые реально что-то поставят: точное число или фон. */
export const activeSlots = (slots: SettlementSlot[]): number =>
  slots.filter((s) => s.count > 0 || s.fill).length;

/** Обязательных построек на поселение — сумма всех «шт». */
export const countTotal = (slots: SettlementSlot[]): number =>
  slots.reduce((sum, s) => sum + s.count, 0);

/** Сколько шаблонов уйдёт в фон: ими добивается остаток пятна. */
export const fillCount = (slots: SettlementSlot[]): number => slots.filter((s) => s.fill).length;

/**
 * Готовый состав под тип поселения (кнопка «Собрать состав»).
 *
 * Кто во что входит — забота composeSettlement; здесь только потолок схемы,
 * чтобы рецепт не отбился ошибкой на пол-экрана из-за шестьдесят первой строки.
 */
export const applyCompose = (
  preset: SettlementPreset,
  options: BuildingOption[],
): SettlementSlot[] => composeSettlement(preset, options).slice(0, MAX_SLOTS);
