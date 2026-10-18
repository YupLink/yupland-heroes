// Наполнение пулов и обмен в банке (владелец, 16.10.2026) — пока только админам.
// Наполнение: админ задаёт сторону A, сторону B сервер считает сам (пул пуст — по
// стартовому курсу, есть запас — в пропорции запасов); DARAI — со счёта админа,
// ресурсы выпускает игра. Обмен — bank_swap_run (migrations/bank-05): формула пула,
// комиссия 80 % в пул / 20 % в пул карты, продажа золота за DARAI — по лицензии с
// суточным лимитом. После наполнения проводится ждущий откуп золота.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { sb } from "../../db/pg";
import { requireAdmin } from "../../auth";
import { accAccountId, humanizeAccError } from "../currency/move";
import { BANK_TOKENS, type BankToken } from "@/lib/castleBank";
import { decimalsOf, fundPair } from "@/lib/bankSwap";
import { licenseActive } from "@/lib/bankLicense";
import { listPools } from "./bank-pools";
import { activeLicenseFor } from "./bank-license";
import { runBuyback } from "./license-money";

async function account(wallet: string): Promise<string> {
  const acc = await accAccountId(wallet);
  if (!acc) throw new Error("Не найден счёт аккаунта");
  return acc;
}

const dpOk = (n: number, t: BankToken) => Math.abs(n * 10 ** decimalsOf(t) - Math.round(n * 10 ** decimalsOf(t))) < 1e-6;

function humanBankError(raw: string): string {
  if (/not_enough_currency|в минус/.test(raw)) return "Не хватает на счёте";
  if (/bank_license_required/.test(raw)) return "Продать золото за DARAI можно только с лицензией";
  const lim = raw.match(/bank_license_limit:([\d.]+):([\d.]+)/);
  if (lim) return `Лимит лицензии: за сутки уже продано ${Number(lim[1]).toLocaleString("ru-RU")} из ${Number(lim[2]).toLocaleString("ru-RU")} золота`;
  if (/bank_swap_slippage/.test(raw)) return "Курс сдвинулся — проверь сумму и обменяй ещё раз";
  if (/bank_pool_empty/.test(raw)) return "Пул пуст — сначала его наполняют";
  if (/bank_swap_too_small/.test(raw)) return "Слишком мало для обмена";
  if (/bank_pool_not_found/.test(raw)) return "Пул не найден";
  return humanizeAccError(raw);
}

export const fundBankPool = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ poolId: z.string().min(3).max(40), amountA: z.number().positive().max(1e12), opId: z.string().min(8).max(40) }).parse(d),
  )
  .handler(async ({ data }) => {
    const wallet = requireAdmin();
    const acc = await account(wallet);
    const pool = (await listPools()).find((p) => p.id === data.poolId);
    if (!pool) throw new Error("Пул не найден");
    if (!dpOk(data.amountA, pool.tokenA)) throw new Error("Слишком много знаков после запятой");
    const amountB = fundPair(pool, data.amountA);
    if (!(amountB > 0)) throw new Error("Слишком мало для пула");
    const { error, data: rows } = await sb.rpc("bank_pool_fund", {
      p_pool: pool.id,
      p_account: acc,
      p_a: data.amountA,
      p_b: amountB,
      p_op: `${acc}:${data.opId}`,
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
        tokenIn: z.enum(BANK_TOKENS),
        amount: z.number().positive().max(1e12),
        minOut: z.number().min(0),
        opId: z.string().min(8).max(40),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const wallet = requireAdmin();
    const acc = await account(wallet);
    if (!dpOk(data.amount, data.tokenIn)) throw new Error("Слишком много знаков после запятой");
    // Лицензия — купленная или по подписке, старшая из двух.
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
    return { out: Number(r?.amount_out ?? 0), applied: r?.applied === true };
  });
