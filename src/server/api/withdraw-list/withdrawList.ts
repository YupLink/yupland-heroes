// Белый список вывода (владелец, 11.11.2026, ПРАВИЛА §8.127): «новым пользователям
// кнопка вывода просто не должна подгружаться»; все, кто был в игре на день выката, —
// в списке (migrations/entry-01). Добавить и убрать — только владелец (withdrawListAdmin).
//
// Список ничего не открывает: Google и номер кошелька закрыты своими правилами
// (noWithdraw.ts). Второй рубеж — триггеры базы (ошибка withdraw_not_listed).
// Только сервер.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { isGoogleTg } from "@/lib/auth/googleTg";

const TTL_MS = 30_000;
const cache = new Map<string, { at: number; on: boolean }>();

/** Аккаунт в списке. Без аккаунта (старые строки) — не трогаем, как и база. */
export async function withdrawListed(account: string | null | undefined): Promise<boolean> {
  if (!account) return true;
  const hit = cache.get(account);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.on;
  const rows = (await mcpExec(`SELECT NOT yuplink.withdraw_unlisted(${sqlStr(account)}) AS ok`, {
    wrapJson: true,
  })) as Array<{ ok: boolean }>;
  const on = rows?.[0]?.ok !== false;
  if (cache.size > 5000) cache.clear();
  // Отказ не помним: долг отдан (§8.129) или владелец добавил в список — вывод сразу.
  if (on) cache.set(account, { at: Date.now(), on });
  return on;
}

/** После правки владельцем — сразу, без ожидания кэша. */
export function forgetWithdrawListed(account: string): void {
  cache.delete(account);
}

/** «Корона»: DARAI введённое + 10 % — своя дверь, мимо списка (buckwheat-04). */
export async function crownOwnOpen(account: string | null | undefined): Promise<boolean> {
  if (!account) return false;
  const rows = (await mcpExec(`SELECT yuplink.withdraw_crown_own(${sqlStr(account)}) AS ok`, {
    wrapJson: true,
  })) as Array<{ ok: boolean }>;
  return rows?.[0]?.ok === true;
}

/** Отказ ручки вывода: аккаунт сессии не в списке или с открытым долгом (§8.129). */
export async function assertWithdrawListed(wallet: string | null): Promise<void> {
  if (!wallet) return;
  const { accAccountId } = await import("../currency/move");
  const account = await accAccountId(wallet);
  if (await withdrawListed(account)) return;
  const { openDebt } = await import("../debt/debt-read");
  if (await openDebt(account)) throw new Error("debt.withdrawClosed");
  throw new Error("withdraw.notListed");
}

/**
 * Флаг сессии «грузить кнопки вывода». Google — никогда; номер кошелька — только
 * «Корона»; остальные — по списку. Окончательно решает ручка вывода.
 */
export async function sessionCanWithdraw(
  account: string | null | undefined,
  tg: number | string | null | undefined,
): Promise<boolean> {
  try {
    if (isGoogleTg(tg)) return await crownOwnOpen(account);
    return await withdrawListed(account);
  } catch {
    return false;
  }
}
