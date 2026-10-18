// Имена игроков для отчётов: @username → tg<id> → acc:<6 символов>.
// Та же лестница, что в admin-economy-players, но одним запросом по списку
// id — отчёты собирают сотни аккаунтов и не могут ходить в базу за каждым.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";

export type NameEntry = { displayName: string; telegramUsername: string | null };

type Row = {
  account_id: string;
  telegram_id: number | string | null;
  telegram_username: string | null;
};

/** Запасное имя, когда аккаунта в базе нет или ответ не пришёл. */
export const fallbackName = (accountId: string): NameEntry => ({
  displayName: `acc:${accountId.slice(0, 6)}`,
  telegramUsername: null,
});

/**
 * Имена по списку account_id. Для каждого id в ответе есть запись —
 * неизвестные получают запасное имя, чтобы вызывающему не проверять Map.
 * Пустой список — без похода в базу.
 */
export async function displayNames(accountIds: string[]): Promise<Map<string, NameEntry>> {
  const ids = [...new Set(accountIds.filter((x) => typeof x === "string" && x.length > 0))];
  const out = new Map<string, NameEntry>();
  for (const id of ids) out.set(id, fallbackName(id));
  if (ids.length === 0) return out;

  // TG-имя — со связки users по account_id (у аккаунта может быть несколько
  // кошельков, имя берём любое непустое, как в сводке игроков).
  const rows = (await mcpExec(
    `SELECT a.id AS account_id, a.telegram_id,
            (SELECT max(u.telegram_username) FROM yuplink.users u
              WHERE u.account_id = a.id AND u.telegram_username IS NOT NULL) AS telegram_username
       FROM yuplink.accounts a
      WHERE a.id IN (${ids.map(sqlStr).join(", ")});`,
    { wrapJson: true },
  ).catch(() => [])) as Row[];

  for (const r of rows ?? []) {
    const uname = r.telegram_username ?? null;
    const tg = r.telegram_id != null ? Number(r.telegram_id) : null;
    const displayName = uname
      ? `@${uname}`
      : tg && Number.isFinite(tg)
        ? `tg${tg}`
        : fallbackName(r.account_id).displayName;
    out.set(r.account_id, { displayName, telegramUsername: uname });
  }
  return out;
}
