// Лицензия банка на продажу золота за DARAI (владелец, 15.10.2026) — открыта игрокам
// 20.10.2026: у кого построен банк (bank-access.ts). Ступени и цены — lib/bankLicense.ts
// (фиксированные с 17.10, покупка самому — ×2 с 31.10). Платить можно DARAI, долларами
// (USDT) или звёздами со счёта (31.10: вместо алмазов; звёзды — от DARAI по курсу, +10 %).
// Из браузера приходят только выбор, валюта и цена, которую игрок видел: не совпала — отказ
// (у звёзд — курс сдвинулся больше допуска, assertShownPrice).
// Оплата и запись — одной функцией bank_license_purchase (migrations/bank-10).
// Лицензия по подписке на энергию в таблицу не пишется — считается из действующих
// подписок (energy_sub.license_tier, esub-06); лимиты разных видов складываются
// (владелец, 30.10.2026), одинаковые — один раз (effectiveLicense).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { sb } from "../../db/pg";
import { mcpExec } from "../../db/mcpClient";
import { requireWallet } from "../../auth";
import { moneyGate } from "../../rateGate";
import { sqlStr } from "../raid-shared";
import { accBalance, humanizeAccError } from "../currency/move";
import { bankAccount } from "./bank-access";
import { daraiPerUsd } from "../energy-sub/rate";
import { assertShownPrice } from "@/lib/usdTariff";
import {
  LICENSE_CURRENCIES,
  LICENSE_DAYS,
  LICENSE_TIERS,
  effectiveLicense,
  licensePrice,
  licenseTier,
  type LicenseCurrency,
  type LicenseTierId,
  type MyLicense,
} from "@/lib/bankLicense";

/** Купленные лицензии — по одной каждого вида (bank-11), даже истёкшие: для «продление / новая». */
export async function licensesFor(acc: string): Promise<MyLicense[]> {
  const rows = (await mcpExec(
    `SELECT tier, daily_limit, ends_at FROM yuplink.bank_license WHERE account_id = ${sqlStr(acc)};`,
    { wrapJson: true },
  )) as Array<{ tier: string; daily_limit: number | string; ends_at: string }> | null;
  return (rows ?? []).flatMap((r) => {
    const tier = licenseTier(r.tier);
    return tier
      ? [{ tier: tier.id, dailyLimit: Number(r.daily_limit), endsAt: String(r.ends_at) }]
      : [];
  });
}

/** Лицензии по подпискам: каждый вид среди действующих подписок, срок — самый поздний конец вида. */
export async function subLicensesFor(acc: string): Promise<MyLicense[]> {
  const rows = (await mcpExec(
    `SELECT license_tier, max(ends_at) AS ends_at FROM yuplink.energy_sub
      WHERE account_id = ${sqlStr(acc)} AND license_tier IS NOT NULL
        AND starts_at <= now() AND ends_at > now()
      GROUP BY license_tier;`,
    { wrapJson: true },
  )) as Array<{ license_tier: string; ends_at: string }>;
  return (rows ?? []).flatMap((r) => {
    const t = licenseTier(r.license_tier);
    return t ? [{ tier: t.id, dailyLimit: t.dailyGold, endsAt: String(r.ends_at) }] : [];
  });
}

/** Лицензия, по которой сейчас можно продавать золото: купленная и по подпискам — сложенные. */
export async function activeLicenseFor(acc: string): Promise<MyLicense> {
  const [paid, subs] = await Promise.all([licensesFor(acc), subLicensesFor(acc)]);
  return effectiveLicense([...paid, ...subs]);
}

/** Алмазы аккаунта — ресурс замка (лицензия за алмазы сжигает их, bank_license_purchase). */
async function diamondsOf(acc: string): Promise<number> {
  const rows = (await mcpExec(
    `SELECT amount::text AS v FROM yuplink.account_resources
      WHERE account_id = ${sqlStr(acc)} AND resource = 'diamonds' LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ v: string }>;
  return Number(rows?.[0]?.v) || 0;
}

/** DARAI за $ по курсу дня (Ref, кэш 5 мин); нет курса — null: звёзды не продаём. */
const rateNow = async (): Promise<number | null> =>
  (await daraiPerUsd().catch(() => null))?.rate ?? null;

// Цены окна — те же, что спишет покупка (licensePrice: ×2 при покупке самому; звёзды — по курсу).
const prices = (rate: number | null) =>
  Object.fromEntries(
    LICENSE_TIERS.map((t) => [
      t.id,
      Object.fromEntries(LICENSE_CURRENCIES.map((c) => [c, licensePrice(t, c, rate)])),
    ]),
  ) as Record<LicenseTierId, Record<LicenseCurrency, number | null>>;

export const getBankLicense = createServerFn({ method: "GET" }).handler(async () => {
  const wallet = requireWallet();
  const acc = await bankAccount(wallet);
  const { buybackStats } = await import("./bank-buyback");
  const [paid, subs, darai, usdt, stars, diamonds, buyback, rate] = await Promise.all([
    licensesFor(acc),
    subLicensesFor(acc),
    accBalance(wallet, "Darai"),
    accBalance(wallet, "USDT"),
    accBalance(wallet, "STARS"),
    diamondsOf(acc),
    buybackStats(),
    rateNow(),
  ]);
  // Сколько золота продано за DARAI за скользящие сутки — для лимита лицензии
  // (проданное по праву «золото с друзей» в лимит не идёт, §8.101) — и сколько
  // золота с друзей ещё меняется без лимита (ref_gold_right, неделя).
  const sold = (await mcpExec(
    `SELECT (SELECT COALESCE(sum(amount_in - ref_gold), 0) FROM yuplink.bank_swap
              WHERE account_id = ${sqlStr(acc)} AND token_in = 'gold' AND token_out = 'Darai'
                AND created_at > now() - interval '24 hours')::text AS v,
            (SELECT COALESCE(sum(left_amount), 0) FROM yuplink.ref_gold_right
              WHERE account_id = ${sqlStr(acc)} AND left_amount > 0 AND expires_at > now())::text AS ref;`,
    { wrapJson: true },
  )) as Array<{ v: string; ref: string }>;
  const soldGold24h = Number(sold?.[0]?.v) || 0;
  const refGold = Number(sold?.[0]?.ref) || 0;
  return {
    /** Действующая для продажи золота: купленная и по подпискам, лимиты разных видов сложены. */
    license: effectiveLicense([...paid, ...subs]),
    /** Купленные, по одной каждого вида (и истёкшие). */
    paid,
    /** Только по подпискам (сложенная) — окно пишет «по подписке», когда купленной нет. */
    sub: effectiveLicense(subs),
    darai,
    usdt,
    stars,
    diamonds,
    prices: prices(rate),
    buyback,
    soldGold24h,
    /** Золото с друзей, что меняется на DARAI без лимита лицензии (§8.101). */
    refGold,
  };
});

const UNIT: Record<LicenseCurrency, string> = {
  Darai: "DARAI",
  USDT: "USDT",
  diamonds: "алмазов",
  STARS: "звёзд",
};

export const buyBankLicense = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        tier: z.enum(["small", "medium", "large"]),
        currency: z.enum(["Darai", "USDT", "diamonds", "STARS"]),
        expectPrice: z.number().positive(),
        opId: z.string().min(8).max(40),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const wallet = requireWallet();
    await moneyGate("bank-license", wallet);
    const acc = await bankAccount(wallet);
    const tier = licenseTier(data.tier)!;
    const stars = data.currency === "STARS";
    const price = licensePrice(tier, data.currency, stars ? await rateNow() : null);
    if (price == null) throw new Error("Курс сейчас недоступен — оплати DARAI или USDT");
    // Звёзды идут за курсом: допуск, как у билетов; DARAI и USDT — ровно та же цена.
    if (stars) assertShownPrice(data.expectPrice, price);
    else if (price !== data.expectPrice)
      throw new Error(
        `Цена изменилась: ${price.toLocaleString("ru-RU")} ${UNIT[data.currency]} — обнови окно`,
      );
    const { error, data: rows } = await sb.rpc("bank_license_purchase", {
      p_account: acc,
      p_tier: tier.id,
      p_limit: tier.dailyGold,
      p_price: price,
      p_days: LICENSE_DAYS,
      p_op: `${acc}:${data.opId}`,
      p_token: data.currency,
    });
    if (error) {
      const msg = String(error.message ?? "");
      throw new Error(
        /not_enough_currency|res_move: в минус/.test(msg)
          ? `Не хватает ${UNIT[data.currency]}`
          : humanizeAccError(msg),
      );
    }
    const row = (rows as Array<{ ends_at: string; applied: boolean }> | null)?.[0];
    // Новая покупка — письмо админам (§8.111); повтор того же нажатия — без письма.
    if (row?.applied === true) {
      const usd = data.currency === "diamonds" ? null : tier.price.USDT;
      const note = `${tier.dailyGold.toLocaleString("ru-RU")} золота в сутки`;
      const sale = { what: "license" as const, title: tier.ru, days: LICENSE_DAYS, note };
      void import("../../salesNotify").then((m) =>
        m.notifySale({
          ...sale,
          amount: price,
          currency: data.currency,
          usd,
          account: acc,
          wallet,
        }),
      );
    }
    // DARAI и USDT: половина — на откуп золота, половина — как подписка; звёзды — целиком
    // как подписка (license-money.ts). Сбой не отменяет покупку: подберёт обход пачек.
    const { bookLicenseMoney } = await import("./license-money");
    await bookLicenseMoney(`${acc}:${data.opId}`).catch((e) =>
      console.warn("[bank] деньги лицензии:", e instanceof Error ? e.message : e),
    );
    return {
      endsAt: String(row?.ends_at ?? ""),
      applied: row?.applied === true,
      price,
      currency: data.currency,
    };
  });
