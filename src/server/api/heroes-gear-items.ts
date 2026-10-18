// Строки списка экипировки: предмет плюс разбор «что он даст ЭТОМУ герою».
// Вынесено из heroes-gear-read.ts ради лимита в 250 строк — логика не менялась.
import { ARTIFACT_SLOTS } from "@/components/heroMeta";
import { isKnownSlotType } from "@/lib/hero/heroSlots";
import { explainGear, type GearPart } from "@/lib/hero/heroStatSources";
import type { HeroStatKey } from "@/lib/heroStats";
import type { LoadedGearPiece } from "./beta-raid/hero-load";

/** Артефакт в окне: числа предмета + разбор под героя. Одинаковые ШАБЛОНЫ
 * схлопнуты в строку (count/itemIds). */
export type GearItemView = {
  itemId: string;
  itemIds: string[];
  count: number;
  templateId: string;
  name: string;
  imageUrl: string | null;
  rarity: string | null;
  slot: string | null;
  statType: string | null;
  statAmount: number;
  immunities: string[];
  /** Бонус к рыбалке, % к базе шанса. 0 — нет (14.10.2026). */
  fishBonusPct: number;
  /** В какую характеристику героя идёт стат. null — стат не распознан. */
  statKey: HeroStatKey | null;
  parts: GearPart[];
  /** Сколько реально достанется ЭТОМУ герою. */
  total: number;
};

/** Предмет, который надеть нельзя: у шаблона нет слота или слот незнакомый. */
export type GearBlocked = GearItemView & { blocked: "no_slot" | "unknown_slot" };

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Заготовка «по записи на каждый слот». */
export function bySlot<T>(make: () => T): Record<string, T> {
  const out: Record<string, T> = {};
  for (const s of ARTIFACT_SLOTS) out[s] = make();
  return out;
}

export type Ctx = { race: string | null; spec: string | null };

/** Одна строка списка: сам предмет плюс разбор под героя. */
export function itemView(p: LoadedGearPiece, ctx: Ctx, ids: string[]): GearItemView {
  const b = explainGear(p, ctx);
  return {
    itemId: ids[0] ?? p.itemId,
    itemIds: ids,
    count: ids.length,
    templateId: p.templateId,
    name: p.name ?? "Артефакт",
    imageUrl: p.imageUrl,
    rarity: p.rarity,
    slot: p.slot ?? null,
    statType: p.statType ?? null,
    statAmount: num(p.statAmount),
    immunities: (p.immunities ?? []).filter((i): i is string => typeof i === "string"),
    fishBonusPct: num(p.fishBonusPct),
    statKey: b.key,
    // Землю подписываем по-человечески: explainGear знает только id клетки
    // (`terrain_7w9uHCgPPM`), а в карточке казарм это выглядело поломкой.
    parts: b.parts.map((part) =>
      part.kind === "land" && p.landName ? { ...part, label: p.landName } : part,
    ),
    total: b.total,
  };
}

/**
 * Что можно надеть. Схлопываем по шаблону, надетое убираем — оно уже в слоте.
 * Ключ — ТИП слота: «Карманы» годятся в любой карман героя.
 */
export function buildOptions(
  all: LoadedGearPiece[],
  worn: Set<string>,
  ctx: Ctx,
): { available: Record<string, GearItemView[]>; noSlot: GearBlocked[] } {
  const available = bySlot<GearItemView[]>(() => []);
  const noSlot: GearBlocked[] = [];
  const byTemplate = new Map<string, { p: LoadedGearPiece; ids: string[] }>();

  for (const p of all) {
    if (worn.has(p.itemId)) continue;
    const g = byTemplate.get(p.templateId);
    if (g) g.ids.push(p.itemId);
    else byTemplate.set(p.templateId, { p, ids: [p.itemId] });
  }

  for (const { p, ids } of byTemplate.values()) {
    const view = itemView(p, ctx, ids);
    const slot = (p.slot ?? "").trim();
    if (!slot) noSlot.push({ ...view, blocked: "no_slot" });
    else if (!isKnownSlotType(slot)) noSlot.push({ ...view, blocked: "unknown_slot" });
    else available[slot].push(view);
  }
  return { available, noSlot };
}
