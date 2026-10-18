// Лицензия банка на продажу золота за DARAI (владелец, 15.10.2026) — пока только
// админам. Ступени и цены — lib/bankLicense.ts (фиксированные с 17.10). Платить можно
// DARAI, долларами (USDT со счёта) или алмазами (ресурс замка, сгорают). Из браузера
// приходят только выбор, валюта и цена, которую игрок видел: не совпала — отказ.
// Оплата и запись — одной функцией bank_license_purchase (migrations/bank-10).
// Лицензия по подписке на энергию в таблицу не пишется — считается из действующих
// подписок (energy_sub.license_tier, esub-06); для лимита берётся старшая из двух.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { sb } from "../../db/pg";
import { mcpExec } from "../../db/mcpClient";
import { requireAdmin } from "../../auth";
import { sqlStr } from "../raid-shared";
import { accAccountId, accBalance, humanizeAccError } from "../currency/move";
import {
  LICENSE_DAYS,
  LICENSE_TIERS,
  effectiveLicense,
  licensePrice,
  licenseTier,
  type LicenseCurrency,
  type LicenseTierId,
  type MyLicense,
} from "@/lib/bankLicense";

async function account(wallet: string): Promise<string> {
  const acc = await accAccountId(wallet);
  if (!acc) throw new Error("Не найден счёт аккаунта");
  return acc;
}

/** Купленная лицензия (строка bank_license), даже истёкшая — для «продление/замена». */
export async function licenseFor(acc: string): Promise<MyLicense> {
  const rows = (await mcpExec(
    `SELECT tier, daily_limit, ends_at FROM yuplink.bank_license WHERE account_id = ${sqlStr(acc)} LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ tier: string; daily_limit: number | string; ends_at: string }>;
  const r = rows?.[0];
  const tier = r ? licenseTier(r.tier) : undefined;
  return r && tier
    ? { tier: tier.id, dailyLimit: Number(r.daily_limit), endsAt: String(r.ends_at) }
    : null;
}

/** Лицензия по подписке: старшая ступень среди действующих подписок, срок — их самый поздний конец. */
export async function subLicenseFor(acc: string): Promise<MyLicense> {
  const rows = (await mcpExec(
    `SELECT license_tier, max(ends_at) AS ends_at FROM yuplink.energy_sub
      WHERE account_id = ${sqlStr(acc)} AND license_tier IS NOT NULL
        AND starts_at <= now() AND ends_at > now()
      GROUP BY license_tier;`,
    { wrapJson: true },
  )) as Array<{ license_tier: string; ends_at: string }>;
  let best: MyLicense = null;
  for (const r of rows ?? []) {
    const t = licenseTier(r.license_tier);
    if (t && (!best || t.dailyGold > best.dailyLimit))
      best = { tier: t.id, dailyLimit: t.dailyGold, endsAt: String(r.ends_at) };
  }
  return best;
}

/** Лицензия, по которой сейчас можно продавать золото (купленная или по подписке). */
export async function activeLicenseFor(acc: string): Promise<MyLicense> {
  const [paid, sub] = await Promise.all([licenseFor(acc), subLicenseFor(acc)]);
  return effectiveLicense(paid, sub);
}

async function diamondsOf(acc: string): Promise<number> {
  const rows = (await mcpExec(
    `SELECT amount::text AS v FROM yuplink.account_resources
      WHERE account_id = ${sqlStr(acc)} AND resource = 'diamonds' LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ v: string }>;
  return Number(rows?.[0]?.v) || 0;
}

const prices = () =>
  Object.fromEntries(LICENSE_TIERS.map((t) => [t.id, t.price])) as Record<
    LicenseTierId,
    Record<LicenseCurrency, number>
  >;

export const getBankLicense = createServerFn({ method: "GET" }).handler(async () => {
  const wallet = requireAdmin();
  const acc = await account(wallet);
  const { buybackStats } = await import("./bank-buyback");
  const [paid, sub, darai, usdt, diamonds, buyback] = await Promise.all([
    licenseFor(acc),
    subLicenseFor(acc),
    accBalance(wallet, "Darai"),
    accBalance(wallet, "USDT"),
    diamondsOf(acc),
    buybackStats(),
  ]);
  // Сколько золота продано за DARAI за скользящие сутки — для лимита лицензии.
  const sold = (await mcpExec(
    `SELECT COALESCE(sum(amount_in), 0)::text AS v FROM yuplink.bank_swap
      WHERE account_id = ${sqlStr(acc)} AND token_in = 'gold' AND token_out = 'Darai'
        AND created_at > now() - interval '24 hours';`,
    { wrapJson: true },
  )) as Array<{ v: string }>;
  const soldGold24h = Number(sold?.[0]?.v) || 0;
  return {
    /** Действующая для продажи золота (старшая из купленной и подписочной). */
    license: effectiveLicense(paid, sub),
    paid,
    sub,
    darai,
    usdt,
    diamonds,
    prices: prices(),
    buyback,
    soldGold24h,
  };
});

const UNIT: Record<LicenseCurrency, string> = { Darai: "DARAI", USDT: "USDT", diamonds: "алмазов" };

export const buyBankLicense = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        tier: z.enum(["small", "medium", "large"]),
        currency: z.enum(["Darai", "USDT", "diamonds"]),
        expectPrice: z.number().positive(),
        opId: z.string().min(8).max(40),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const wallet = requireAdmin();
    const acc = await account(wallet);
    const tier = licenseTier(data.tier)!;
    const price = licensePrice(tier, data.currency);
    if (price !== data.expectPrice)
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
    // DARAI и USDT: половина — на откуп золота, половина — как подписка (license-money.ts).
    // Алмазы просто сгорают — раскладывать нечего. Сбой не отменяет покупку:
    // недоразложенное подберёт обход пачек.
    if (data.currency !== "diamonds") {
      const { bookLicenseMoney } = await import("./license-money");
      await bookLicenseMoney(`${acc}:${data.opId}`).catch((e) =>
        console.warn("[bank] деньги лицензии:", e instanceof Error ? e.message : e),
      );
    }
    return {
      endsAt: String(row?.ends_at ?? ""),
      applied: row?.applied === true,
      price,
      currency: data.currency,
    };
  });
