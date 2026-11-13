// Долг аккаунта (владелец, 13.11.2026; ПРАВИЛА §8.129) — чтение для ручек и гейтов.
// Только сервер.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";

export type DebtView = { total: number; paid: number; left: number };

/** Открытый долг аккаунта; null — долга нет или он отдан. */
export async function openDebt(account: string | null | undefined): Promise<DebtView | null> {
  if (!account) return null;
  const rows = (await mcpExec(
    `SELECT total::float8 AS total, paid::float8 AS paid
       FROM yuplink.account_debt
      WHERE account_id = ${sqlStr(account)} AND paid < total`,
    { wrapJson: true },
  )) as Array<{ total: number; paid: number }>;
  const r = rows?.[0];
  if (!r) return null;
  const total = Number(r.total) || 0;
  const paid = Number(r.paid) || 0;
  return { total, paid, left: Math.max(0, total - paid) };
}

/**
 * Должнику — отказ (§8.129): покупка у других игроков (рынок героев, аукцион игрока,
 * маркет фишек) — это перевод стоимости другу, который её выведет.
 */
export async function assertNoDebt(
  account: string | null | undefined,
  code = "debt.p2pClosed",
): Promise<void> {
  if (await openDebt(account)) throw new Error(code);
}
