// Банк в замке. С 21.10.2026 (владелец) банк у всех построен сразу — строить не
// нужно. Кто строил его раньше (строка castle_bank), при следующем входе в банк
// видит окно с потраченными ресурсами и «ОК»: ресурсы сразу возвращаются на
// баланс, не подарком (castle_bank_refund, migrations/bank-11).
import { createServerFn } from "@tanstack/react-start";
import { sb } from "../../db/pg";
import { mcpExec } from "../../db/mcpClient";
import { requireWallet } from "../../auth";
import { sqlStr } from "../raid-shared";
import { raidOwner } from "../beta-raid/owner";
import type { BankCost } from "@/lib/castleBank";

const KEYS: Array<keyof BankCost> = ["wood", "stone", "gold", "diamonds"];

function asCost(raw: unknown): BankCost | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const cost = Object.fromEntries(KEYS.map((k) => [k, Number(o[k]) || 0])) as BankCost;
  return KEYS.some((k) => cost[k] > 0) ? cost : null;
}

/** Сколько ждёт возврата за постройку; нечего — null. */
export async function bankRefundFor(account: string): Promise<BankCost | null> {
  const rows = (await mcpExec(
    `SELECT cost FROM yuplink.castle_bank
      WHERE account_id = ${sqlStr(account)} AND refunded_at IS NULL;`,
    { wrapJson: true },
  )) as Array<{ cost: unknown }> | null;
  return asCost(rows?.[0]?.cost);
}

/** Банк построен у всех; refund — что вернуть строившему (null — нечего). */
export const getCastleBank = createServerFn({ method: "GET" }).handler(async () => {
  const wallet = requireWallet();
  return { built: true as const, refund: await bankRefundFor(await raidOwner(wallet)) };
});

/** «ОК» в окне возврата: ресурсы на баланс. Повтор ничего не начисляет. */
export const claimBankRefund = createServerFn({ method: "POST" }).handler(async () => {
  const wallet = requireWallet();
  const { data, error } = await sb.rpc("castle_bank_refund", { p_account: await raidOwner(wallet) });
  if (error) throw new Error(String(error.message ?? "Не удалось"));
  return { refunded: asCost(data) };
});
