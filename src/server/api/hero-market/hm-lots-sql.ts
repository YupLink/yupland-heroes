// Рынок героев: выдача лотов с фильтрами и страницами — текстом SQL (проверяется
// тестом и EXPLAIN на живой базе). Характеристики героя (навыки, сытость, надетые
// артефакты с износом, книга заклинаний) — только у активного лота: он лежит в
// залоге '_hero_market', у проданного это уже чужой герой.
import { z } from "zod";
import { sqlStr } from "@/server/api/raid-shared";
import { HERO_MARKET_PAGE_MAX } from "@/lib/heroMarket";
import { enchantPctSql } from "@/server/api/beta-raid/enchant/enchant-sql";

export const HERO_MARKET_ESCROW = "_hero_market";

export const lotsInputSchema = z.object({
  /** Часть имени героя, без учёта регистра. */
  name: z.string().trim().max(60).optional(),
  rarity: z
    .array(z.enum(["rare", "epic", "legendary"]))
    .max(3)
    .optional(),
  /** Раса и специализация — как в шаблоне героя («Юпик», «Маг»…). */
  race: z.string().trim().max(40).optional(),
  specialization: z.string().trim().max(40).optional(),
  levelMin: z.number().int().min(0).max(10_000).optional(),
  levelMax: z.number().int().min(0).max(10_000).optional(),
  /** К какой цене относятся priceMin/priceMax; задана — только лоты с этой ценой. */
  priceCurrency: z.enum(["gold", "darai"]).optional(),
  priceMin: z.number().min(0).optional(),
  priceMax: z.number().min(0).optional(),
  /** Только мои лоты (тогда можно смотреть и закрытые — status). */
  mine: z.boolean().optional(),
  status: z.enum(["active", "sold", "withdrawn", "all"]).optional(),
  sort: z.enum(["new", "price_asc", "price_desc", "level_desc", "level_asc"]).optional(),
  limit: z.number().int().min(1).max(HERO_MARKET_PAGE_MAX).optional(),
  offset: z.number().int().min(0).max(100_000).optional(),
});
export type LotsInput = z.infer<typeof lotsInputSchema>;

const like = (s: string): string => `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** Условия выдачи. me — аккаунт смотрящего (нужен для «мои»). */
export function lotsWhere(f: LotsInput, me: string | null): string[] {
  const w: string[] = [];
  if (f.mine) {
    w.push(`l.seller_account = ${sqlStr(me ?? "-")}`);
    if (f.status && f.status !== "all") w.push(`l.status = ${sqlStr(f.status)}`);
    if (!f.status) w.push("l.status = 'active'");
  } else {
    w.push("l.status = 'active'");
  }
  if (f.name) w.push(`l.name ILIKE ${sqlStr(like(f.name))} ESCAPE '\\'`);
  if (f.rarity?.length) w.push(`l.rarity IN (${f.rarity.map(sqlStr).join(", ")})`);
  if (f.race) w.push(`l.race = ${sqlStr(f.race)}`);
  if (f.specialization) w.push(`l.specialization = ${sqlStr(f.specialization)}`);
  if (f.levelMin != null) w.push(`l.level >= ${Math.floor(f.levelMin)}`);
  if (f.levelMax != null) w.push(`l.level <= ${Math.floor(f.levelMax)}`);
  const col = f.priceCurrency === "darai" ? "l.price_darai" : "l.price_gold";
  if (f.priceCurrency) w.push(`${col} IS NOT NULL`);
  if (f.priceMin != null) w.push(`${col} >= ${Number(f.priceMin)}`);
  if (f.priceMax != null) w.push(`${col} <= ${Number(f.priceMax)}`);
  return w;
}

export function lotsOrder(f: LotsInput): string {
  const col = f.priceCurrency === "darai" ? "l.price_darai" : "l.price_gold";
  switch (f.sort) {
    case "price_asc":
      return `${col} ASC NULLS LAST, l.created_at DESC, l.id`;
    case "price_desc":
      return `${col} DESC NULLS LAST, l.created_at DESC, l.id`;
    case "level_desc":
      return "l.level DESC, l.created_at DESC, l.id";
    case "level_asc":
      return "l.level ASC, l.created_at DESC, l.id";
    default:
      return "l.created_at DESC, l.id";
  }
}

const ESC = sqlStr(HERO_MARKET_ESCROW);

/** Колонки лота + характеристики героя (у активного) + total по всей выдаче. */
export const LOT_COLS = `l.id, l.status, l.item_id AS "itemId", l.hero_id AS "heroId",
       l.template_id AS "templateId", l.name, l.image_url AS "imageUrl", l.race,
       l.specialization, l.rarity, l.level, l.price_gold::float8 AS "priceGold",
       l.price_darai::float8 AS "priceDarai", l.seller_account AS "sellerAccount",
       l.buyer_account AS "buyerAccount", l.paid_currency AS "paidCurrency",
       l.paid_amount::float8 AS "paidAmount", l.fee::float8 AS fee,
       l.seller_got::float8 AS "sellerGot", l.created_at AS "createdAt", l.closed_at AS "closedAt",
       h.skills, h.satiety::float8 AS satiety, h.equipped,
       (SELECT COALESCE(jsonb_agg(jsonb_build_object('itemId', a.id, 'templateId', a.template_id,
                 'name', t.name, 'imageUrl', t.image_url, 'rarity', t.rarity, 'slotType', t.slot,
                 'wear', a.wear, 'statType', t.stat_type, 'statAmount', t.stat_amount,
                 'enchantPct', ${enchantPctSql("a")}) ORDER BY a.id),
               '[]'::jsonb)
          FROM yuplink.user_game_item a JOIN yuplink.mystic_item_template t ON t.id = a.template_id
         WHERE l.status = 'active' AND a.id = ANY (l.arts) AND a.account_id = ${ESC}) AS arts,
       (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'image', s.image)
                 ORDER BY s.name), '[]'::jsonb)
          FROM yuplink.hero_spellbook b JOIN yuplink.raid_spell s ON s.id = b.spell_id
         WHERE l.status = 'active' AND b.hero_id = l.hero_id) AS spells`;

const FROM = `FROM yuplink.hero_market_lot l
  LEFT JOIN yuplink.hero_instance h
         ON l.status = 'active' AND h.item_id = l.item_id AND h.account_id = ${ESC}`;

/** Страница выдачи; total — сколько всего под фильтром (для «ещё N»). */
export function lotsSql(f: LotsInput, me: string | null): string {
  const limit = Math.min(HERO_MARKET_PAGE_MAX, f.limit ?? 20);
  return `SELECT ${LOT_COLS}, count(*) OVER ()::int AS total
  ${FROM}
 WHERE ${lotsWhere(f, me).join("\n   AND ")}
 ORDER BY ${lotsOrder(f)}
 LIMIT ${limit} OFFSET ${Math.floor(f.offset ?? 0)}`;
}

/** Один лот: активный — любому, закрытый — только продавцу и покупателю. */
export function lotSql(lotId: string, me: string | null): string {
  const who = sqlStr(me ?? "-");
  return `SELECT ${LOT_COLS}, 1 AS total
  ${FROM}
 WHERE l.id = ${sqlStr(lotId)}
   AND (l.status = 'active' OR l.seller_account = ${who} OR l.buyer_account = ${who})
 LIMIT 1`;
}
