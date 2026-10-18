// Энергопаки: витрина для игрока (цены, лимиты, текущая ступень лестницы).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nanoid } from "nanoid";
import { pg, sb } from "../db/pg";
import { mcpExec } from "../db/mcpClient";
import { assertNotMaintenance } from "../maintenance";
import { requireFreshClient } from "../buildGate";
import { parsePricing, nextPrice, totalTimes, payKey, payName, usdKeyOf } from "@/lib/energySteps";
import { usdPrices } from "@/lib/usdTariff";
import { priceIn } from "@/lib/energySub";
import {
  DARAI_FT_CONTRACT,
  DARAI_DECIMALS,
  DARAI_DEPOSIT_RECEIVER,
  ENERGY_SHOP_KEY,
  requireWallet,
  requireAdmin,
  sqlStr,
  applyDiscountCeil,
  energyShopEnabled,
  getCurrentWallet,
  isAdminWallet,
} from "./energy-packs-shared";

// ──────── ПУБЛИЧНЫЙ СПИСОК ────────
// Показывает активные энерго-паки. Пока килсвич OFF — только владельцу (тест).
// dailyUsed — сколько уже куплено сегодня (per-TG). effectivePrice — с учётом
// подписки. discountPct — насколько дешевле энергия относительно ПЕРВОГО пака.
export const listEnergyPacksPublic = createServerFn({ method: "GET" }).handler(async () => {
  const wallet = getCurrentWallet();
  const enabled = await energyShopEnabled();
  // Пока не включено — виден только админам (для теста).
  if (!enabled && !(wallet && isAdminWallet(wallet))) {
    return { enabled: false, packs: [] as Array<never> };
  }

  const { data } = await pg.energyPacks
    .raw()
    .select("*")
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .order("amount", { ascending: true });
  const packs = (data ?? []) as Array<import("../db/pg").PgEnergyPack>;
  if (packs.length === 0) return { enabled, packs: [] as Array<never> };

  // Подписочная скидка (как в билет-шопе).
  let disc = 0;
  let sisters: string[] = [];
  const dailyUsed = new Map<string, number>();
  const usedCur = new Map<string, Map<string, number>>();
  if (wallet) {
    const { getSisterWallets, fetchSubscriptionDiscount } = await import("./user");
    sisters = await getSisterWallets(wallet);
    disc = (await fetchSubscriptionDiscount(wallet)).discountPct ?? 0;
    // Сколько куплено каждого пака СЕГОДНЯ (UTC) этим игроком.
    const used = (await mcpExec(
      `SELECT pack_id, pay_with, token_symbol, count(*)::int c FROM yuplink.energy_pack_purchases
          WHERE account_id = ${sqlStr((await (await import("./user-shared")).accountIdOf(wallet)) ?? "нет")}
            AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC')
          GROUP BY pack_id, pay_with, token_symbol;`,
      { wrapJson: true },
    )) as Array<{ pack_id: string; pay_with: string; token_symbol: string | null; c: number }>;
    for (const r of used) {
      const n = Number(r.c);
      dailyUsed.set(r.pack_id, (dailyUsed.get(r.pack_id) ?? 0) + n);
      // Отдельно по валютам: лимиты у каждой свои.
      const key = r.pay_with === "token" && r.token_symbol ? `token:${r.token_symbol}` : r.pay_with;
      const byCur = usedCur.get(r.pack_id) ?? new Map<string, number>();
      byCur.set(key, (byCur.get(key) ?? 0) + n);
      usedCur.set(r.pack_id, byCur);
    }
  }

  // База для скидки — первый пак (наименьший sort_order): его цена за 1 энергию.
  const base = packs[0];
  const baseTk =
    base.price_tickets != null && base.amount > 0 ? base.price_tickets / base.amount : null;
  const baseDr =
    base.price_darai != null && base.amount > 0 ? base.price_darai / base.amount : null;

  // Инфо по токен-ценам: ft_contract + decimals из reward_tokens (для on-chain оплаты).
  // Символы берём и из старого поля, и из лестниц — иначе у токена из
  // лестницы не будет контракта, и оплатить им было бы нечем.
  const tokSyms = Array.from(
    new Set([
      ...packs.map((p) => p.price_token_symbol).filter((x): x is string => !!x),
      ...packs.flatMap((p) =>
        parsePricing(p.price_steps)
          .filter((o): o is Extract<typeof o, { kind: "token" }> => o.kind === "token")
          .map((o) => o.symbol),
      ),
    ]),
  );
  // Тариф в $: валюты считаются от ступени по курсу DARAI (кэш Ref, как у подписки).
  const hasUsd = packs.some((p) => parsePricing(p.price_steps).some((o) => o.kind === "usd"));
  const rate = hasUsd
    ? ((await (await import("./energy-sub/rate")).daraiPerUsd())?.rate ?? null)
    : null;
  const tokMeta = new Map<string, { ftContract: string; decimals: number }>();
  if (tokSyms.length > 0) {
    const { data: trows } = await pg.rewardTokens
      .raw()
      .select("symbol,ft_contract,decimals")
      .in("symbol", tokSyms);
    for (const t of (trows ?? []) as Array<{
      symbol: string;
      ft_contract: string;
      decimals: number;
    }>)
      tokMeta.set(t.symbol, { ftContract: t.ft_contract, decimals: t.decimals });
  }

  return {
    enabled,
    packs: packs.map((p) => {
      const perTk = p.price_tickets != null && p.amount > 0 ? p.price_tickets / p.amount : null;
      const perDr = p.price_darai != null && p.amount > 0 ? p.price_darai / p.amount : null;
      const discTk =
        baseTk != null && perTk != null && baseTk > 0
          ? Math.max(0, Math.round((1 - perTk / baseTk) * 100))
          : 0;
      const discDr =
        baseDr != null && perDr != null && baseDr > 0
          ? Math.max(0, Math.round((1 - perDr / baseDr) * 100))
          : 0;
      return {
        id: p.id,
        title: p.title,
        amount: p.amount,
        priceTickets: p.price_tickets,
        priceDarai: p.price_darai,
        // Цена с учётом подписки (билеты). DARAI/токены не скидочные (донат).
        effectivePriceTickets:
          p.price_tickets != null ? applyDiscountCeil(p.price_tickets, disc) : null,
        // Оплата произвольным FT-токеном: symbol + сумма + контракт/decimals для tx.
        token:
          p.price_token_symbol && p.price_token_amount != null && tokMeta.has(p.price_token_symbol)
            ? {
                symbol: p.price_token_symbol,
                amount: p.price_token_amount,
                ftContract: tokMeta.get(p.price_token_symbol)!.ftContract,
                decimals: tokMeta.get(p.price_token_symbol)!.decimals,
              }
            : null,
        dailyLimit: p.daily_limit,
        dailyUsed: dailyUsed.get(p.id) ?? 0,
        // Умное предложение: по каждой валюте — цена следующей покупки и
        // сколько уже взято сегодня. Валюты независимы: кончилась одна —
        // остальные остаются активными.
        offers: (() => {
          const pricing = parsePricing(p.price_steps);
          if (pricing.length === 0) return null;
          const byCur = usedCur.get(p.id) ?? new Map<string, number>();
          const usdKey = usdKeyOf(pricing);
          return pricing.map((opt) => {
            const key = payKey(opt);
            // Покупки за звёзды по тарифу в $ — в тот же счётчик (USDT-лесенки).
            const u =
              (byCur.get(key) ?? 0) +
              (key === usdKey && key !== "usd" ? (byCur.get("usd") ?? 0) : 0);
            // Контракт и decimals обязательны: без них клиент не соберёт
            // on-chain перевод и покажет «токен не сконфигурирован».
            const meta = opt.kind === "token" ? tokMeta.get(opt.symbol) : undefined;
            return {
              key,
              label: payName(opt),
              kind: opt.kind,
              symbol: opt.kind === "token" ? opt.symbol : null,
              ftContract: meta?.ftContract ?? null,
              decimals: meta?.decimals ?? null,
              price: nextPrice(opt, u),
              // Тариф в $: цена следующей ступени в USDT / DARAI / Stars.
              // Тариф в $: вид usd — все три валюты от ступени; USDT-лесенка
              // («если $ — от $») — к её цене добавляются звёзды.
              usd: (() => {
                const step = key === usdKey ? nextPrice(opt, u) : null;
                if (step == null) return null;
                if (opt.kind === "usd") return usdPrices(step, rate);
                return { USDT: step, Darai: null, STARS: priceIn(step, "STARS", null) };
              })(),
              used: u,
              total: totalTimes(opt),
            };
          });
        })(),
        bulkDiscountTickets: discTk, // насколько дешевле энергия vs первый пак
        bulkDiscountDarai: discDr,
      };
    }),
  };
});
