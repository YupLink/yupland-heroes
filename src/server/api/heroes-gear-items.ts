// Строки списка экипировки: предмет плюс разбор «что он даст ЭТОМУ герою».
// Вынесено из heroes-gear-read.ts ради лимита в 250 строк — логика не менялась.
import { ARTIFACT_SLOTS } from "@/components/heroMeta";
import { isKnownSlotType } from "@/lib/hero/heroSlots";
import { MOUNT_SLOT } from "@/lib/hero/mount";
import { explainGear, type GearPart } from "@/lib/hero/heroStatSources";
import type { HeroStatKey } from "@/lib/heroStats";
import type { LoadedGearPiece } from "./beta-raid/hero-load";
import { artDisabled, artDurability, artWearOf } from "@/lib/hero/artWear";

/** Артефакт в окне: числа предмета + разбор под героя. Одинаковые ШАБЛОНЫ
 * одной прочности схлопнуты в строку (count/itemIds). */
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
  /** Прочность, % (lib/hero/artWear): 0 — сломан (пока ремонта нет — даёт всё, как целый). */
  durability: number;
  /** Конь (§8.84): вид — темп на карте и прыжок пегаса; не конь — null. */
  mount?: string | null;
  /** Зачарование экземпляра, % (§8.87); нет поля — не зачарован. Числа выше уже с ним. */
  enchantPct?: number | null;
};

/** Предмет, который надеть нельзя: у шаблона нет слота или слот незнакомый. */
export type GearBlocked = GearItemView & { blocked: "no_slot" | "unknown_slot" };

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Заготовка «по записи на каждый слот». */
export function bySlot<T>(make: () => T): Record<string, T> {
  const out: Record<string, T> = {};
  for (const s of ARTIFACT_SLOTS) out[s] = make();
  out[MOUNT_SLOT] = make(); // кони (§8.84) — своим местом
  return out;
}

export type Ctx = { race: string | null; spec: string | null };

/** Одна строка списка: сам предмет плюс разбор под героя. */
export function itemView(p: LoadedGearPiece, ctx: Ctx, ids: string[]): GearItemView {
  const b = explainGear(p, ctx);
  // Выключенный поломкой (artDisabled) ничего не даёт: написанное на нём видно,
  // но каждая строка — «(+0)», итог ноль — как и в бою. Пока ремонта нет — не бывает.
  const broken = artDisabled(p.wear);
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
    parts: b.parts.map((part) => ({
      ...part,
      ...(part.kind === "land" && p.landName ? { label: p.landName } : {}),
      ...(broken ? { applied: false } : {}),
    })),
    total: broken ? 0 : b.total,
    durability: artDurability(p.wear),
    mount: p.mount ?? null,
    ...(p.enchantPct != null ? { enchantPct: Number(p.enchantPct) } : {}),
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
    // Разная прочность — разные строки: у каждой своя полоса, и надевается
    // ровно тот экземпляр, который игрок видел. Зачарованный — тоже своей строкой.
    const key = `${p.templateId}|${artWearOf(p.wear)}|${p.enchantPct ?? ""}`;
    const g = byTemplate.get(key);
    if (g) g.ids.push(p.itemId);
    else byTemplate.set(key, { p, ids: [p.itemId] });
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
