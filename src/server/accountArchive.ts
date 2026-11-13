// Один аккаунт на Telegram / Google / кошелёк (владелец, 06.11.2026). Правило и
// переезд ключей — в базе (migrations/acc-archive-01.sql): основной — где больше
// видов ресурсов, второй уходит в архив без ключей входа, ресурсы не складываются.
//
// Здесь — что нужно серверу: сессия, открытая в архивном аккаунте до слияния,
// дальше играет основным; на привязке ключа правило применяется сразу.
import { mcpExec } from "./db/mcpClient";

const TTL_MS = 60_000;
const cache = new Map<string, { into: string | null; at: number }>();

/** Куда ушёл архивный аккаунт; не в архиве — null. Кэш на минуту. */
export async function archivedInto(account: string): Promise<string | null> {
  const now = Date.now();
  const hit = cache.get(account);
  if (hit && now - hit.at < TTL_MS) return hit.into;
  const rows = (await mcpExec(
    `SELECT archived_into FROM yuplink.accounts WHERE id = '${account.replace(/'/g, "''")}'`,
    { wrapJson: true },
  ).catch(() => null)) as Array<{ archived_into: string | null }> | null;
  // База не ответила — не решаем за игрока, играет как играл.
  if (!rows) return null;
  const into = rows[0]?.archived_into ?? null;
  if (cache.size > 5000) for (const [k, v] of cache) if (now - v.at >= TTL_MS) cache.delete(k);
  cache.set(account, { into, at: now });
  return into;
}

/**
 * Все аккаунты этого Telegram — в один (правило базы). Админские Telegram не
 * трогаем: у них бывают служебные аккаунты. Возвращает основной.
 */
export async function oneAccountPerTg(tg: number, reason: string): Promise<string | null> {
  if (!Number.isSafeInteger(tg) || tg <= 0) return null;
  const { isAdminTg } = await import("./adminTg");
  if (isAdminTg(tg)) return null;
  const rows = (await mcpExec(
    `SELECT yuplink.account_one_per_tg(${tg}, '${reason.replace(/'/g, "''")}') AS main`,
    { wrapJson: true },
  )) as Array<{ main: string | null }>;
  const main = rows?.[0]?.main ?? null;
  if (main) cache.clear();
  return main;
}

/** Два аккаунта → один по правилу. Возвращает основной. */
export async function mergeByRule(a: string, b: string, reason: string): Promise<string> {
  if (a === b) return a;
  const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
  const rows = (await mcpExec(
    `SELECT yuplink.account_merge_by_rule(${q(a)}, ${q(b)}, ${q(reason)}) AS main`,
    { wrapJson: true },
  )) as Array<{ main: string }>;
  const main = rows?.[0]?.main;
  if (!main) throw new Error("Не удалось объединить аккаунты");
  cache.clear();
  return main;
}
