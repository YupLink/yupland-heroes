// Рынок героев: кого из своих можно выставить и почему нельзя остальных, курс
// DARAI и пороги цены — для окна «Выставить» (ПРАВИЛА §8.67).
//
// Это подсказка интерфейсу; решает функция базы под замком героя (hero_market_list):
// между показом и нажатием герой мог стать основным или уйти на грядку.
//
// Превью карманов — та же раскладка, что у выставления (hm-pockets-plan), на
// рюкзаке основного «как сейчас», по каждому герою отдельно. Пачка тратит место
// основного по очереди — окончательный список приходит в итоге выставления.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { poolGoldRate, type GoldPoolRow } from "@/server/api/craft-gold-price";
import { LOOT_BAG_TTL_HOURS } from "@/lib/lootBag";
import {
  HERO_MARKET_BATCH_MAX,
  HERO_MARKET_FEE_PERCENT,
  HERO_MARKET_MAX_DARAI,
  HERO_MARKET_MAX_GOLD,
  HERO_MARKET_MIN_GOLD,
  HERO_MARKET_PAGE_MAX,
  heroMarketMinDarai,
  isHeroMarketRarity,
  type HeroMarketRarity,
} from "@/lib/heroMarket";
import {
  sellableReason,
  sellableSql,
  type SellableHero,
  type SellableRow,
} from "@/server/api/hero-market/hm-sellable-sql";
import {
  dropsKey,
  dropsOf,
  isMush,
  movesOf,
  planPockets,
  type MainBag,
} from "@/server/api/hero-market/hm-pockets-plan";
import { mainCapsOf, readAccountPockets } from "@/server/api/hero-market/hm-pockets-read";

export type { SellableHero } from "@/server/api/hero-market/hm-sellable-sql";

/** Курс пула банка gold/Darai (DARAI за 1 золото) — свежим чтением; пула нет — null. */
export async function daraiRateNow(): Promise<number | null> {
  const rows = (await mcpExec(
    `SELECT reserve_a, reserve_b, weight_a, weight_b FROM yuplink.bank_pool
      WHERE token_a = 'gold' AND token_b = 'Darai' ORDER BY id LIMIT 1`,
    { wrapJson: true },
  )) as GoldPoolRow[] | null;
  return poolGoldRate(rows?.[0]);
}

export type HeroMarketConfig = {
  feePercent: number;
  minGold: Record<HeroMarketRarity, number>;
  /** Минимум в DARAI по текущему курсу; null — курса нет (DARAI-цену не принять). */
  minDarai: Record<HeroMarketRarity, number> | null;
  daraiRate: number | null;
  maxGold: number;
  maxDarai: number;
  batchMax: number;
  pageMax: number;
  /** Сколько часов живёт порция мешочка с карманами. */
  bagHours: number;
};

export async function heroMarketConfig(): Promise<HeroMarketConfig> {
  const rate = await daraiRateNow().catch(() => null);
  const minDarai =
    rate == null
      ? null
      : {
          rare: heroMarketMinDarai("rare", rate) ?? 0,
          epic: heroMarketMinDarai("epic", rate) ?? 0,
          legendary: heroMarketMinDarai("legendary", rate) ?? 0,
        };
  return {
    feePercent: HERO_MARKET_FEE_PERCENT,
    minGold: { ...HERO_MARKET_MIN_GOLD },
    minDarai,
    daraiRate: rate,
    maxGold: HERO_MARKET_MAX_GOLD,
    maxDarai: HERO_MARKET_MAX_DARAI,
    batchMax: HERO_MARKET_BATCH_MAX,
    pageMax: HERO_MARKET_PAGE_MAX,
    bagHours: LOOT_BAG_TTL_HOURS,
  };
}

export async function sellableHeroes(wallet: string, account: string): Promise<SellableHero[]> {
  const [rows, pos, pockets, caps] = await Promise.all([
    mcpExec(sellableSql(account), { wrapJson: true }) as Promise<SellableRow[] | null>,
    mcpExec(
      `SELECT 1 AS hit FROM yuplink.beta_raid_positions WHERE account_id = ${sqlStr(account)} LIMIT 1`,
      { wrapJson: true },
    ) as Promise<unknown[] | null>,
    readAccountPockets(account),
    mainCapsOf(wallet),
  ]);
  const onMap = (pos?.length ?? 0) > 0;
  const main: MainBag | null = caps
    ? { ...caps, stacks: (pockets.get(caps.heroId) ?? []).map((p) => ({ ...p })) }
    : null;
  return (rows ?? []).map((r): SellableHero => {
    // Основной сам себе карманы не отдаёт — у него раскладки нет (отказ active).
    const own = r.heroId && !r.active ? (pockets.get(r.heroId) ?? []) : [];
    const lines = planPockets(own, main);
    const drops = dropsOf(lines);
    const mushrooms = own.some(isMush);
    const reason = sellableReason(r, { onMap, hasMain: !!main, drops: drops.length, mushrooms });
    return {
      itemId: r.itemId,
      heroId: r.heroId ?? null,
      templateId: r.templateId,
      name: r.name,
      imageUrl: r.imageUrl ?? null,
      race: r.race ?? null,
      specialization: r.specialization ?? null,
      rarity: isHeroMarketRarity(r.rarity) ? r.rarity : "common",
      level: Number(r.level) || 0,
      pockets: Number(r.pockets) || 0,
      toMain: movesOf(lines),
      drops,
      dropsKey: dropsKey(drops),
      canList: reason == null,
      reason,
      restUntil: r.restUntil ?? null,
    };
  });
}
