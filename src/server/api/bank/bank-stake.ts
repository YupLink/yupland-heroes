// Стейкинг банка (владелец + Архан, 16.10.2026, ПРАВИЛА §8.51) — открыт игрокам
// 20.10.2026: у кого построен банк (bank-access.ts); отмена своего вывода холдеров — игроку.
// Вклад DARAI со счёта на выбранный срок (lib/bankStake.ts: % и золото в сутки),
// снятие (в локе раньше срока — сначала списать 50 % начисленного золота, ту сумму,
// что игрок подтвердил в окне, потом вернуть DARAI), метка DARAI холдеров на счёте
// и их выводы, ждущие срок. Деньги двигают функции базы (migrations/bank-06, bank-07,
// tix-gold-03): bank_stake_open / bank_stake_close / holder_withdraw_cancel.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { sb } from "../../db/pg";
import { mcpExec } from "../../db/mcpClient";
import { requireWallet } from "../../auth";
import { moneyGate } from "../../rateGate";
import { sqlStr } from "../raid-shared";
import { accAccountId, accBalance, humanizeAccError } from "../currency/move";
import { bankAccount } from "./bank-access";
import {
  STAKE_PLANS,
  goldPerDay,
  stakePlan,
  type MyStake,
  type StakePlanId,
} from "@/lib/bankStake";

async function account(wallet: string): Promise<string> {
  const acc = await accAccountId(wallet);
  if (!acc) throw new Error("Не найден счёт аккаунта");
  return acc;
}

/** Окно подтверждения показало меньше золота, чем нужно сейчас. */
export const STAKE_GOLD_CHANGED = "Сумма изменилась — открой окно заново";

export function humanStakeError(raw: string): string {
  if (/bank_stake_gold_changed/.test(raw)) return STAKE_GOLD_CHANGED;
  // Вклад NFT-холдера до срока не снимается вовсе (bank-10, §8.51 п. 3).
  const held = raw.match(/bank_stake_holder_lock:(\d+)/);
  if (held) {
    const at = new Date(Number(held[1])).toLocaleDateString("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" });
    return `Вклад холдера снимается не раньше ${at}`;
  }
  const gold = raw.match(/bank_stake_gold:([\d.]+)/);
  if (gold) return `Не хватает золота: нужно ${Number(gold[1]).toLocaleString("ru-RU")}`;
  if (/bank_stake_not_found/.test(raw)) return "Вклад не найден";
  return humanizeAccError(raw);
}

export type HolderHold = {
  id: string;
  days: number;
  gross: number;
  fee: number;
  payout: number;
  releaseAt: string;
};
export type HolderTag = { d7: number; d30: number };

/** Метка DARAI холдеров на счёте и выводы, ждущие срок. */
export async function holderTagFor(acc: string): Promise<{ tag: HolderTag; holds: HolderHold[] }> {
  const rows = (await mcpExec(
    `SELECT (SELECT row_to_json(h) FROM (SELECT d7, d30 FROM yuplink.holder_darai WHERE account_id = ${sqlStr(acc)}) h) AS tag,
            (SELECT COALESCE(json_agg(w ORDER BY w.release_at), '[]'::json) FROM (
               SELECT id, days, gross, fee, payout, release_at FROM yuplink.holder_withdraw
                WHERE account_id = ${sqlStr(acc)} AND status = 'waiting') w) AS holds;`,
    { wrapJson: true },
  )) as Array<{
    tag: { d7: number | string; d30: number | string } | null;
    holds: Array<Record<string, unknown>>;
  }>;
  const r = rows?.[0];
  return {
    tag: { d7: Number(r?.tag?.d7 ?? 0), d30: Number(r?.tag?.d30 ?? 0) },
    holds: (r?.holds ?? []).map((h) => ({
      id: String(h.id),
      days: Number(h.days),
      gross: Number(h.gross),
      fee: Number(h.fee),
      payout: Number(h.payout),
      releaseAt: String(h.release_at),
    })),
  };
}

type StakeRow = {
  id: string;
  source: "darai" | "holder";
  plan: StakePlanId;
  pct: number | string;
  amount: number | string;
  holder: number | string;
  gold_day: number | string;
  gold_paid: number | string;
  lock_until: string | null;
  hold_until: string | null;
  created_at: string;
  nft_title: string | null;
};

async function stakesOf(acc: string): Promise<MyStake[]> {
  const rows = (await mcpExec(
    `SELECT id, source, plan, pct, amount, holder7 + holder30 AS holder, gold_day, gold_paid,
            lock_until, created_at, nft_title,
            yuplink.bank_stake_holder_until(source, created_at, holder30) AS hold_until
       FROM yuplink.bank_stake WHERE account_id = ${sqlStr(acc)} AND status = 'active'
      ORDER BY created_at DESC LIMIT 100;`,
    { wrapJson: true },
  )) as StakeRow[];
  return (rows ?? []).map((r) => ({
    id: r.id,
    source: r.source,
    plan: r.plan,
    pct: Number(r.pct),
    amount: Number(r.amount),
    holder: Number(r.holder),
    goldDay: Number(r.gold_day),
    goldPaid: Number(r.gold_paid),
    lockUntil: r.lock_until,
    holdUntil: r.hold_until,
    createdAt: r.created_at,
    nftTitle: r.nft_title,
  }));
}

export const getBankStake = createServerFn({ method: "GET" }).handler(async () => {
  const wallet = requireWallet();
  const acc = await bankAccount(wallet);
  // Начисление идёт обходом раз в 5 минут; окно открыли — свои сутки догоняем сразу.
  await mcpExec(
    `SELECT yuplink.bank_stake_accrue(id) FROM yuplink.bank_stake
      WHERE account_id = ${sqlStr(acc)} AND status = 'active';`,
  ).catch(() => {});
  const [stakes, darai, holder] = await Promise.all([
    stakesOf(acc),
    accBalance(wallet, "Darai"),
    holderTagFor(acc),
  ]);
  return { stakes, darai, ...holder };
});

export const openBankStake = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        amount: z.number().positive().max(1e13),
        plan: z.enum(STAKE_PLANS.map((p) => p.id) as [StakePlanId, ...StakePlanId[]]),
        opId: z.string().min(8).max(40),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const wallet = requireWallet();
    await moneyGate("bank-stake-open", wallet);
    const acc = await bankAccount(wallet);
    const plan = stakePlan(data.plan)!;
    const amount = Math.floor(data.amount * 1e8) / 1e8;
    const { error, data: rows } = await sb.rpc("bank_stake_open", {
      p_account: acc,
      p_wallet: wallet,
      p_amount: amount,
      p_plan: plan.id,
      p_pct: plan.pct,
      p_days: plan.days,
      p_gold_day: goldPerDay(amount, plan.pct),
      p_op: `${acc}:${data.opId}`,
    });
    if (error) throw new Error(humanStakeError(String(error.message ?? "")));
    const r = (rows as Array<{ stake_id: string; applied: boolean }> | null)?.[0];
    return { stakeId: String(r?.stake_id ?? ""), applied: r?.applied === true };
  });

export const closeBankStake = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        stakeId: z.string().min(4).max(40),
        // Сколько золота показали игроку в подтверждении; старое окно без суммы — 0.
        confirmGold: z.number().min(0).max(1e13).default(0),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const wallet = requireWallet();
    await moneyGate("bank-stake-close", wallet);
    const acc = await bankAccount(wallet);
    // База сама считает золото возврата; больше подтверждённого — отказ без движений.
    const { error, data: rows } = await sb.rpc("bank_stake_close", {
      p_stake: data.stakeId,
      p_account: acc,
      p_wallet: wallet,
      p_max_gold: data.confirmGold,
    });
    if (error) throw new Error(humanStakeError(String(error.message ?? "")));
    const r = (rows as Array<{ darai: number; gold_back: number }> | null)?.[0];
    return { darai: Number(r?.darai ?? 0), goldBack: Number(r?.gold_back ?? 0) };
  });

export const cancelHolderWithdraw = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ holdId: z.string().min(4).max(40) }).parse(d))
  .handler(async ({ data }) => {
    // Своя заявка: база отменяет только вывод этого аккаунта (account_id = p_account).
    const wallet = requireWallet();
    await moneyGate("holder-withdraw-cancel", wallet);
    const acc = await account(wallet);
    const { error, data: rows } = await sb.rpc("holder_withdraw_cancel", {
      p_id: data.holdId,
      p_account: acc,
    });
    if (error) throw new Error(humanizeAccError(String(error.message ?? "")));
    const ok = (rows as Array<{ holder_withdraw_cancel: boolean }> | null)?.[0]
      ?.holder_withdraw_cancel;
    return { cancelled: ok === true };
  });

/** Метка холдеров на своём счёте — для окна вывода (метка может прийти и не админу: продажа лота). */
export const getMyHolderDarai = createServerFn({ method: "GET" }).handler(async () => {
  const acc = await accAccountId(requireWallet());
  return acc ? holderTagFor(acc) : { tag: { d7: 0, d30: 0 }, holds: [] as HolderHold[] };
});
