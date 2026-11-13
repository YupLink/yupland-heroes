// Рынок героев — серверные ручки (ПРАВИЛА §8.67; договор с интерфейсом —
// docs/hero-market-api.md). Логика — в соседних модулях, здесь только вход:
// кошелёк → аккаунт (игрок = аккаунт), техработы, частота нажатий.
//
//   getHeroMarketConfig   — пороги цены, комиссия, курс DARAI;
//   listHeroMarketLots    — лоты с фильтрами и страницами (и «мои»);
//   getHeroLot            — один лот;
//   listMySellableHeroes  — мои герои: можно ли выставить и почему нет;
//   listHeroesForSale     — выставить одного/нескольких, итог по каждому;
//   buyHeroLot            — купить за выбранную валюту;
//   withdrawHeroLot       — снять свой лот.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getCurrentWallet, requireWallet } from "@/server/auth";
import { assertNotMaintenance } from "@/server/maintenance";
import { actionGate, moneyGate } from "@/server/rateGate";
import { mcpExec } from "@/server/db/mcpClient";
import { accountIdOf, accountOf } from "@/server/api/user-shared";
import { ownerNames } from "@/server/api/beta-raid/chest/chest-owner";
import { heroMarketConfig, sellableHeroes } from "@/server/api/hero-market/hm-sellable";
import { listHeroesAs, listInputSchema } from "@/server/api/hero-market/hm-list";
import { googleOnlyWallet } from "@/lib/auth/entryRules";
import {
  buyHeroAs,
  buyInputSchema,
  withdrawHeroAs,
  withdrawInputSchema,
} from "@/server/api/hero-market/hm-trade";
import { lotSql, lotsInputSchema, lotsSql } from "@/server/api/hero-market/hm-lots-sql";
import { lotView, type HeroLotView, type LotRow } from "@/server/api/hero-market/hm-view";

export type { HeroLotView, LotArtifact, LotSpell } from "@/server/api/hero-market/hm-view";
export type {
  HeroListResult,
  PocketDrop,
  PocketMove,
  PocketStack,
} from "@/server/api/hero-market/hm-list";
export type { BuyResult, WithdrawResult } from "@/server/api/hero-market/hm-trade";
export type { HeroMarketConfig, SellableHero } from "@/server/api/hero-market/hm-sellable";
export type { LotsInput } from "@/server/api/hero-market/hm-lots-sql";

/** Кошелёк для записи: подключён, не техработы. */
function writer(): string {
  const wallet = requireWallet();
  assertNotMaintenance(wallet);
  return wallet;
}

/** Строки → виды лотов с именами продавцов/покупателей одним запросом. */
async function views(rows: LotRow[], me: string | null): Promise<HeroLotView[]> {
  const accounts = rows.flatMap((r) => [r.sellerAccount, r.buyerAccount ?? ""]).filter(Boolean);
  const names = await ownerNames(accounts);
  return rows.map((r) => lotView(r, me, names));
}

export const getHeroMarketConfig = createServerFn({ method: "GET" }).handler(async () =>
  heroMarketConfig(),
);

export const listHeroMarketLots = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => lotsInputSchema.parse(d ?? {}))
  .handler(async ({ data }) => {
    const wallet = getCurrentWallet();
    const me = wallet ? await accountIdOf(wallet) : null;
    if (data.mine && !me) return { lots: [] as HeroLotView[], total: 0, nextOffset: null };
    const rows = ((await mcpExec(lotsSql(data, me), { wrapJson: true })) ?? []) as LotRow[];
    const total = Number(rows[0]?.total) || 0;
    const offset = (data.offset ?? 0) + rows.length;
    return { lots: await views(rows, me), total, nextOffset: offset < total ? offset : null };
  });

export const getHeroLot = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ lotId: z.string().trim().min(1).max(80) }).parse(d))
  .handler(async ({ data }) => {
    const wallet = getCurrentWallet();
    const me = wallet ? await accountIdOf(wallet) : null;
    const rows = ((await mcpExec(lotSql(data.lotId, me), { wrapJson: true })) ?? []) as LotRow[];
    if (!rows[0]) throw new Error("heromkt.lot_none");
    return (await views(rows, me))[0];
  });

export const listMySellableHeroes = createServerFn({ method: "GET" }).handler(async () => {
  const wallet = requireWallet();
  return sellableHeroes(wallet, await accountOf(wallet));
});

export const listHeroesForSale = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => listInputSchema.parse(d))
  .handler(async ({ data }) => {
    const wallet = writer();
    await actionGate("hero-market-list", wallet);
    // «Только Google» (владелец, 11.11.2026, §8.127): продаёт только за золото.
    if (googleOnlyWallet(wallet) && data.heroes.some((h) => h.priceDarai != null))
      throw new Error("google.goldOnly");
    return listHeroesAs(wallet, await accountOf(wallet), data);
  });

export const buyHeroLot = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => buyInputSchema.parse(d))
  .handler(async ({ data }) => {
    const wallet = writer();
    await moneyGate("hero-market-buy", wallet);
    const account = await accountOf(wallet);
    // Должник у игроков не покупает (§8.129).
    await (await import("../debt/debt-read")).assertNoDebt(account);
    return buyHeroAs(wallet, account, data);
  });

export const withdrawHeroLot = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => withdrawInputSchema.parse(d))
  .handler(async ({ data }) => {
    const wallet = writer();
    await actionGate("hero-market-withdraw", wallet);
    return withdrawHeroAs(await accountOf(wallet), data);
  });
