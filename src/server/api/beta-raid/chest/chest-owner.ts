// Имя владельца сундука для окон победителя: @username → id<tg> → кошелёк
// (как доска урона). Одним запросом на все аккаунты списка добычи.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";

/** Имена по аккаунтам. Сбой чтения — пустой словарь: окно покажет «чужой». */
export async function ownerNames(accounts: readonly string[]): Promise<Map<string, string>> {
  const ids = [...new Set(accounts.filter(Boolean))];
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  const rows = (await mcpExec(
    `SELECT account_id AS acc,
            COALESCE(
              '@' || min(telegram_username) FILTER (WHERE COALESCE(telegram_username, '') <> ''),
              'id' || (min(telegram_id) FILTER (WHERE telegram_id IS NOT NULL))::text,
              min(wallet)) AS name
       FROM yuplink.users
      WHERE account_id IN (${ids.map(sqlStr).join(", ")})
      GROUP BY account_id;`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ acc: string; name: string | null }>;
  for (const row of rows ?? []) {
    const name = row.name?.trim();
    if (row.acc && name) out.set(row.acc, name);
  }
  return out;
}

/** Имя одного владельца или null. */
export async function ownerName(account: string): Promise<string | null> {
  return (await ownerNames([account])).get(account) ?? null;
}
