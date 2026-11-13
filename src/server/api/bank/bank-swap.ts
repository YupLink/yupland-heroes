// Наполнение пулов и обмен в банке (владелец, 16.10.2026). Наполнение — только админ;
// обмен открыт игрокам 20.10.2026 — у кого построен банк (bank-access.ts).
// Наполнение: админ задаёт сторону A, сторону B сервер считает сам (пул пуст — по
// стартовому курсу, есть запас — в пропорции запасов); монеты (DARAI, USDT, звёзды…) —
// с 29.10.2026 с основного кошелька игры, ни с чьего счёта (bank-fund-cover.ts:
// «свободно» ≥ сумма, иначе отказ до записи; bank_pool_fund_main, migrations/bank-13),
// ресурсы выпускает игра. Обмен — bank_swap_run (migrations/bank-05, bank-12): формула
// пула, комиссия 80 % в пул / 20 % в пул карты (у монет без пула карты — вся в пул), продажа золота за DARAI — по лицензии с суточным лимитом.
// После наполнения проводится ждущий откуп золота.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { sb } from "../../db/pg";
import { requireAdmin, requireWallet } from "../../auth";
import { moneyGate } from "../../rateGate";
import { humanizeAccError } from "../currency/move";
import { dpOf, fundPair } from "@/lib/bankSwap";
import { licenseActive } from "@/lib/bankLicense";
import { listPools, usdtPool } from "./bank-pools";
import { googleOnlyWallet } from "@/lib/auth/entryRules";
import { activeLicenseFor } from "./bank-license";
import { runBuyback } from "./license-money";
import { bankAccount } from "./bank-access";
import { bankTokenDp } from "./bank-tokens";
import { FUND_ACCOUNT, FUND_WALLET, assertFundCovered } from "./bank-fund-cover";
import { openDebt } from "../debt/debt-read";

const dpOk = (n: number, dp: number) => Math.abs(n * 10 ** dp - Math.round(n * 10 ** dp)) < 1e-6;

function humanBankError(raw: string): string {
  if (/not_enough_currency|в минус/.test(raw)) return "Не хватает на счёте";
  if (/bank_license_required/.test(raw)) return "Продать золото за DARAI можно только с лицензией";
  const lim = raw.match(/bank_license_limit:([\d.]+):([\d.]+)/);
  if (lim)
    return `Лимит лицензии: за сутки уже продано ${Number(lim[1]).toLocaleString("ru-RU")} из ${Number(lim[2]).toLocaleString("ru-RU")} золота`;
  if (/bank_swap_slippage/.test(raw)) return "Курс сдвинулся — проверь сумму и обменяй ещё раз";
  if (/bank_pool_empty/.test(raw)) return "Пул пуст — сначала его наполняют";
  if (/bank_swap_too_small/.test(raw)) return "Слишком мало для обмена";
  if (/bank_pool_not_found/.test(raw)) return "Пул не найден";
  if (/bank_unknown_token/.test(raw)) return "Такой монеты в банке нет";
  return humanizeAccError(raw);
}

export const fundBankPool = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        poolId: z.string().min(3).max(40),
        amountA: z.number().positive().max(1e12),
        opId: z.string().min(8).max(40),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const wallet = requireAdmin();
    const pool = (await listPools()).find((p) => p.id === data.poolId);
    if (!pool) throw new Error("Пул не найден");
    if (!dpOk(data.amountA, dpOf(pool, pool.tokenA)))
      throw new Error("Слишком много знаков после запятой");
    const amountB = fundPair(pool, data.amountA);
    if (!(amountB > 0)) throw new Error("Слишком мало для пула");
    // DARAI на основном кошельке не лежит 1:1 (проект чеканит сам), поэтому пулы с DARAI
    // наполняются по-старому — со счёта нажавшего админа (§8.48); остальные монеты — с кошелька.
    const darai = pool.tokenA === "Darai" || pool.tokenB === "Darai";
    if (!darai) await assertFundCovered(pool, data.amountA, amountB);
    const acc = darai ? await bankAccount(wallet) : null;
    const { error, data: rows } = acc
      ? await sb.rpc("bank_pool_fund", {
          p_pool: pool.id,
          p_account: acc,
          p_a: data.amountA,
          p_b: amountB,
          p_op: `${acc}:${data.opId}`,
        })
      : await sb.rpc("bank_pool_fund_main", {
          p_pool: pool.id,
          p_wallet: FUND_WALLET,
          p_a: data.amountA,
          p_b: amountB,
          p_op: `${FUND_ACCOUNT}:${data.opId}`,
        });
    if (error) throw new Error(humanBankError(String(error.message ?? "")));
    // Пул стал не пустым — ждущий откуп золота проводится сразу.
    await runBuyback();
    const r = (rows as Array<{ reserve_a: number; reserve_b: number }> | null)?.[0];
    return { amountB, reserveA: Number(r?.reserve_a ?? 0), reserveB: Number(r?.reserve_b ?? 0) };
  });

export const swapBank = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        poolId: z.string().min(3).max(40),
        tokenIn: z.string().regex(/^[A-Za-z0-9_-]{1,24}$/),
        amount: z.number().positive().max(1e12),
        minOut: z.number().min(0),
        opId: z.string().min(8).max(40),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const wallet = requireWallet();
    await moneyGate("bank-swap", wallet);
    // «Только Google» (§8.127): обмен с USDT закрыт, золото ↔ DARAI — как у всех.
    if (googleOnlyWallet(wallet)) {
      const pool = (await listPools()).find((p) => p.id === data.poolId);
      if (!pool || usdtPool(pool)) throw new Error("google.noUsdt");
    }
    const acc = await bankAccount(wallet);
    // Должник (§8.129): монеты → золото можно, золото → монеты нельзя (ресурсы — можно).
    if (data.tokenIn === "gold" && (await openDebt(acc))) {
      const pool = (await listPools()).find((p) => p.id === data.poolId);
      const other = pool ? (pool.tokenA === "gold" ? pool.tokenB : pool.tokenA) : "";
      if (!["wood", "stone", "diamonds"].includes(other)) throw new Error("debt.goldSwapClosed");
    }
    const dp = await bankTokenDp(data.tokenIn);
    if (dp == null) throw new Error("Такой монеты в банке нет");
    if (!dpOk(data.amount, dp)) throw new Error("Слишком много знаков после запятой");
    // Лицензия — купленная и по подпискам, лимиты разных видов сложены.
    const lic = data.tokenIn === "gold" ? await activeLicenseFor(acc) : null;
    const { error, data: rows } = await sb.rpc("bank_swap_run", {
      p_pool: data.poolId,
      p_account: acc,
      p_token_in: data.tokenIn,
      p_amount: data.amount,
      p_min_out: data.minOut,
      p_op: `${acc}:${data.opId}`,
      p_limit: lic && licenseActive(lic) ? lic.dailyLimit : null,
    });
    if (error) throw new Error(humanBankError(String(error.message ?? "")));
    const r = (rows as Array<{ amount_out: number; applied: boolean }> | null)?.[0];
    // Курс сдвинулся — график банка перечитает историю сразу, а не через полминуты.
    (await import("./bank-rate")).dropRateCache(data.poolId);
    return { out: Number(r?.amount_out ?? 0), applied: r?.applied === true };
  });
