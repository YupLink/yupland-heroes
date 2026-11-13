// Имя владельца сундука для окон победителя: своё имя → @username → id<tg> → кошелёк
// (как доска урона). Одним запросом на все аккаунты списка добычи.
import { mcpExec } from "@/server/db/mcpClient";
import { accountNamesSql } from "@/server/api/player-name/player-name-sql";

/** Имена по аккаунтам. Сбой чтения — пустой словарь: окно покажет «чужой». */
export async function ownerNames(accounts: readonly string[]): Promise<Map<string, string>> {
  const ids = [...new Set(accounts.filter(Boolean))];
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  const rows = (await mcpExec(accountNamesSql(ids), { wrapJson: true }).catch(() => [])) as Array<{
    account_id: string;
    name: string | null;
  }>;
  for (const row of rows ?? []) {
    const name = row.name?.trim();
    if (row.account_id && name) out.set(row.account_id, name);
  }
  return out;
}

/** Имя одного владельца или null. */
export async function ownerName(account: string): Promise<string | null> {
  return (await ownerNames([account])).get(account) ?? null;
}
