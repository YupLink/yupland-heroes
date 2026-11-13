// Имя игрока для других (lib/playerName): своё имя из профиля, иначе как было —
// @ник Telegram, id<tg>, кошелёк. Один источник для всех досок и списков.
import { sqlStr } from "@/server/api/raid-shared";

/** Своё имя аккаунта (выражение) — NULL, если не задано. acc — SQL-выражение id. */
export const customNameSql = (acc: string): string =>
  `(SELECT NULLIF(btrim(pa.display_name), '') FROM yuplink.accounts pa WHERE pa.id = ${acc})`;

/** Имена по аккаунтам: строки (account_id, name). */
export function accountNamesSql(accounts: readonly string[]): string {
  return `SELECT u.account_id,
          COALESCE(
            ${customNameSql("u.account_id")},
            '@' || min(u.telegram_username) FILTER (WHERE COALESCE(u.telegram_username,'') <> ''),
            'id' || (min(u.telegram_id) FILTER (WHERE u.telegram_id IS NOT NULL))::text,
            min(u.wallet)
          ) AS name
     FROM yuplink.users u
    WHERE u.account_id IN (${accounts.map(sqlStr).join(",")})
    GROUP BY u.account_id;`;
}

/** Подписи по кошелькам: своё имя, иначе @ник; ни того ни другого — строки нет. */
export function walletLabelsSql(wallets: readonly string[]): string {
  return `SELECT u.wallet,
          COALESCE(${customNameSql("u.account_id")},
                   '@' || NULLIF(btrim(u.telegram_username), '')) AS name
     FROM yuplink.users u
    WHERE u.wallet IN (${wallets.map(sqlStr).join(",")});`;
}
