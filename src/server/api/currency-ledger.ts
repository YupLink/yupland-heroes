// Единый леджер валют: один источник правды по балансам всех токенов.
//
// Баланс = сумма движений по (аккаунт, токен). Никаких UPDATE amount — только
// вставки, иначе баланс нельзя пересчитать и доказать. Идемпотентность по
// (kind, ref): повторная обработка того же события не задваивает движение.
//
// Виды движений (kind):
//   deposit  — пополнение с кошелька (входящий ft_transfer)
//   reward   — начисленная награда
//   payout   — выплата на кошелёк (обратное движение к reward)
//   purchase — трата внутри игры
//   adjust   — ручная правка админом (всегда с пояснением в ref)
import { createServerFn } from "@tanstack/react-start";
import { nanoid } from "nanoid";
import { mcpExec } from "../db/mcpClient";
import { sqlStr } from "./chips-utils";
import { requireWallet } from "./energy-packs-shared";

export type LedgerKind = "deposit" | "reward" | "payout" | "purchase" | "adjust";

/** Символ токена писали и как DARAI, и как Darai — приводим к одному виду. */
export function canonToken(symbol: string): string {
  return symbol.trim().toUpperCase() === "DARAI" ? "Darai" : symbol.trim();
}

async function accountOf(wallet: string): Promise<string> {
  const { getAccountId } = await import("../accountBalances");
  const accountId = await getAccountId(wallet);
  if (!accountId) throw new Error("Аккаунт не найден");
  return accountId;
}

/**
 * Записать движение. Возвращает false, если такое (kind, ref) уже было —
 * это не ошибка, а нормальный повтор (ретрай, второй вебхук, догоняющий крон).
 */
export async function moveCurrency(args: {
  wallet: string;
  token: string;
  delta: number;
  kind: LedgerKind;
  /** Ссылка на источник: хэш транзакции, id покупки, id награды. */
  ref?: string | null;
  accountId?: string;
}): Promise<boolean> {
  const accountId = args.accountId ?? (await accountOf(args.wallet));
  const token = canonToken(args.token);
  if (!Number.isFinite(args.delta) || args.delta === 0) return false;

  const rows = (await mcpExec(
    `INSERT INTO yuplink.currency_ledger (id, account_id, wallet, token, delta, kind, ref, created_at)
     VALUES (${sqlStr(`cl_${nanoid(12)}`)}, ${sqlStr(accountId)}, ${sqlStr(args.wallet)},
             ${sqlStr(token)}, ${Number(args.delta)}, ${sqlStr(args.kind)},
             ${args.ref ? sqlStr(args.ref) : "NULL"}, now())
     ON CONFLICT (kind, ref) WHERE ref IS NOT NULL DO NOTHING
     RETURNING id;`,
    { wrapJsonCte: true },
  )) as Array<{ id: string }>;
  return Array.isArray(rows) && rows.length > 0;
}

/** Баланс одного токена по аккаунту игрока. */
export async function currencyBalance(wallet: string, token: string): Promise<number> {
  const accountId = await accountOf(wallet);
  const rows = (await mcpExec(
    `SELECT COALESCE(sum(delta), 0) AS balance FROM yuplink.currency_ledger
      WHERE account_id = ${sqlStr(accountId)} AND token = ${sqlStr(canonToken(token))};`,
    { wrapJson: true },
  )) as Array<{ balance: string }>;
  return Number(rows?.[0]?.balance ?? 0);
}

/** Все ненулевые балансы аккаунта — для кошелька и витрин. */
export async function currencyBalances(
  wallet: string,
): Promise<Array<{ token: string; balance: number }>> {
  const accountId = await accountOf(wallet);
  const rows = (await mcpExec(
    `SELECT token, sum(delta) AS balance FROM yuplink.currency_ledger
      WHERE account_id = ${sqlStr(accountId)}
      GROUP BY token HAVING sum(delta) <> 0 ORDER BY sum(delta) DESC;`,
    { wrapJson: true },
  )) as Array<{ token: string; balance: string }>;
  return (rows ?? []).map((r) => ({ token: r.token, balance: Number(r.balance) }));
}

/** Показать игроку его балансы. Пока только чтение — тратится по-старому. */
export const getMyCurrencyBalances = createServerFn({ method: "GET" }).handler(async () => {
  const wallet = requireWallet();
  return { balances: await currencyBalances(wallet) };
});
