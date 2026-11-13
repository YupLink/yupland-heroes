// Рынок героев: строка выдачи (hm-lots-sql) → вид лота для интерфейса.
//
// Статы — карточкой героя (heroCardStats: раса + специализация на уровне роста
// плюс вложенные очки навыков), как в инвентаре; надетые артефакты — отдельным
// списком с местом, износом и прибавкой: они едут к покупателю вместе с героем.
// Продавец — именем (@username → id<tg> → кошелёк), аккаунт наружу не отдаём.
import { heroCardStats, heroSkillCard } from "@/server/api/heroes-skill-card";
import { MAX_LEVEL_BY_RARITY } from "@/lib/heroLevels";
import { enchantStatsOf } from "@/lib/enchant/enchantGear";
import type { HeroStats } from "@/lib/heroStats";
import type { HeroSkills } from "@/lib/hero/heroSkills";
import type { HeroMarketCurrency, HeroMarketRarity } from "@/lib/heroMarket";

export type LotRow = {
  id: string;
  status: string;
  itemId: string;
  heroId: string | null;
  templateId: string;
  name: string;
  imageUrl: string | null;
  race: string | null;
  specialization: string | null;
  rarity: string;
  level: number | string;
  priceGold: number | null;
  priceDarai: number | null;
  sellerAccount: string;
  buyerAccount: string | null;
  paidCurrency: string | null;
  paidAmount: number | null;
  fee: number | null;
  sellerGot: number | null;
  createdAt: string;
  closedAt: string | null;
  skills: unknown;
  satiety: number | null;
  equipped: unknown;
  arts: unknown;
  spells: unknown;
  total?: number;
};

export type LotArtifact = {
  itemId: string;
  templateId: string;
  name: string;
  imageUrl: string | null;
  rarity: string | null;
  /** Место на герое («Голова», «Правая рука»…); null — не нашлось в раскладке. */
  slot: string | null;
  slotType: string | null;
  /** Износ, % (0 — новый, 100 — сломан). */
  wear: number;
  statType: string | null;
  statAmount: number | null;
  /** Зачарование экземпляра, % (§8.87); нет поля — не зачарован. */
  enchantPct?: number;
};

export type LotSpell = { id: string; name: string; image: string | null };

export type HeroLotView = {
  id: string;
  status: "active" | "sold" | "withdrawn";
  /** Мой лот (тогда «Снять» вместо «Купить»). */
  mine: boolean;
  sellerName: string | null;
  priceGold: number | null;
  priceDarai: number | null;
  createdAt: string;
  closedAt: string | null;
  hero: {
    itemId: string;
    heroId: string | null;
    templateId: string;
    name: string;
    imageUrl: string | null;
    rarity: HeroMarketRarity;
    race: string | null;
    specialization: string | null;
    level: number;
    maxLevel: number;
    baseLevel: number;
    skills: HeroSkills;
    skillEarned: number;
    skillFree: number;
    stats: HeroStats;
    /** Сытость; null — полная (lib/hero/satiety). */
    satiety: number | null;
    artifacts: LotArtifact[];
    spells: LotSpell[];
  };
  /** Итог продажи — только в «моих» проданных. */
  sale: {
    currency: HeroMarketCurrency;
    price: number;
    fee: number;
    sellerGot: number;
    buyerName: string | null;
  } | null;
};

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
const numOrNull = (v: unknown): number | null =>
  v == null || !Number.isFinite(Number(v)) ? null : Number(v);
const arr = (v: unknown): Array<Record<string, unknown>> =>
  Array.isArray(v) ? (v as Array<Record<string, unknown>>) : [];
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

/** Раскладка героя «место → id предмета» наоборот: id → место. */
function slotsById(equipped: unknown): Map<string, string> {
  const out = new Map<string, string>();
  if (!equipped || typeof equipped !== "object" || Array.isArray(equipped)) return out;
  for (const [slot, id] of Object.entries(equipped as Record<string, unknown>))
    if (typeof id === "string") out.set(id, slot);
  return out;
}

const RARITIES: HeroMarketRarity[] = ["rare", "epic", "legendary"];

export function lotView(row: LotRow, me: string | null, names: Map<string, string>): HeroLotView {
  const rarity = RARITIES.includes(row.rarity as HeroMarketRarity)
    ? (row.rarity as HeroMarketRarity)
    : "rare";
  const level = num(row.level);
  const card = heroSkillCard(rarity, level, row.skills);
  const slots = slotsById(row.equipped);
  const mine = !!me && row.sellerAccount === me;
  const status = row.status === "sold" || row.status === "withdrawn" ? row.status : "active";
  return {
    id: row.id,
    status,
    mine,
    sellerName: names.get(row.sellerAccount) ?? null,
    priceGold: numOrNull(row.priceGold),
    priceDarai: numOrNull(row.priceDarai),
    createdAt: row.createdAt,
    closedAt: row.closedAt ?? null,
    hero: {
      itemId: row.itemId,
      heroId: row.heroId ?? null,
      templateId: row.templateId,
      name: row.name,
      imageUrl: row.imageUrl ?? null,
      rarity,
      race: row.race ?? null,
      specialization: row.specialization ?? null,
      level,
      maxLevel: MAX_LEVEL_BY_RARITY[rarity],
      ...card,
      stats: heroCardStats(
        row.race ?? null,
        row.specialization ?? null,
        rarity,
        level,
        card.skills,
      ),
      satiety: numOrNull(row.satiety),
      artifacts: arr(row.arts).map((a) => ({
        itemId: String(a.itemId ?? ""),
        templateId: String(a.templateId ?? ""),
        name: String(a.name ?? ""),
        imageUrl: str(a.imageUrl),
        rarity: str(a.rarity),
        slot: slots.get(String(a.itemId ?? "")) ?? null,
        slotType: str(a.slotType),
        wear: num(a.wear),
        statType: str(a.statType),
        // Зачарованный экземпляр (лавка зачарования) — стат × (1 + pct/100) вверх.
        statAmount:
          enchantStatsOf({ statAmount: numOrNull(a.statAmount) }, numOrNull(a.enchantPct))
            .statAmount ?? null,
        ...(numOrNull(a.enchantPct) != null ? { enchantPct: Number(a.enchantPct) } : {}),
      })),
      spells: arr(row.spells).map((s) => ({
        id: String(s.id ?? ""),
        name: String(s.name ?? ""),
        image: str(s.image),
      })),
    },
    sale:
      mine && status === "sold"
        ? {
            currency: row.paidCurrency === "darai" ? "darai" : "gold",
            price: num(row.paidAmount),
            fee: num(row.fee),
            sellerGot: num(row.sellerGot),
            buyerName: row.buyerAccount ? (names.get(row.buyerAccount) ?? null) : null,
          }
        : null,
  };
}
