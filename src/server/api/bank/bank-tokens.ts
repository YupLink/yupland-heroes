// Чем можно торговать в банке (владелец, 25.10.2026: «все токены, которые у нас есть…
// звёзды, USDT… на выбор к паре всего»): ресурсы игры и все монеты счёта
// (reward_tokens). Знаков после запятой — как в базе (bank_token_dp, bank-12):
// ресурс — 4, монета — как у самой монеты, но не больше 8.
import { createServerFn } from "@tanstack/react-start";
import { mcpExec } from "../../db/mcpClient";
import { requireAdmin } from "../../auth";
import { BANK_RESOURCES, type BankTokenInfo } from "@/lib/castleBank";

const TTL_MS = 60_000;
let cache: { at: number; value: Promise<BankTokenInfo[]> } | null = null;

async function load(): Promise<BankTokenInfo[]> {
  const rows = (await mcpExec(
    `SELECT symbol, LEAST(8, GREATEST(0, decimals)) AS dp
       FROM yuplink.reward_tokens ORDER BY sort_order NULLS LAST, symbol;`,
    { wrapJson: true },
  )) as Array<{ symbol: string; dp: number | string }>;
  const coins = (rows ?? []).map((r) => ({ symbol: String(r.symbol), dp: Number(r.dp) || 0 }));
  return [...BANK_RESOURCES.map((symbol) => ({ symbol, dp: 4 })), ...coins];
}

/** Ресурсы и монеты банка; минута кэша — монеты заводят редко. */
export function bankTokens(): Promise<BankTokenInfo[]> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.value;
  const value = load();
  cache = { at: now, value };
  value.catch(() => {
    if (cache?.value === value) cache = null;
  });
  return value;
}

/** Знаков у ресурса или монеты; null — такой в банке нет. */
export async function bankTokenDp(symbol: string): Promise<number | null> {
  return (await bankTokens()).find((t) => t.symbol === symbol)?.dp ?? null;
}

/** Список для формы нового пула (только админ). */
export const listBankTokens = createServerFn({ method: "GET" }).handler(async () => {
  requireAdmin();
  return bankTokens();
});
