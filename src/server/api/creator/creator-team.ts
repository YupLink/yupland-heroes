// Команда креаторов (владелец, 07.11.2026: «Ярославу — добавлять креаторов на
// эту роль по тг-нику; поле „добавить креатора“ только у меня и Ярослава; там
// же список всех креаторов и их портфолио — их миры»). Только админам игры.
//
// Право — тот же реестр admin_rights (settings), что и у остальных прав по
// одному: добавить = дописать «creator» аккаунту, не трогая чужие права.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import type { CreatorMember } from "@/lib/raid/creator/ids";
import { listWorks, namesOf } from "./creator-store";

/** «@Player_Nick » → «player_nick»; не ник Telegram — null. */
export function cleanTgNick(raw: string): string | null {
  const nick = raw.trim().replace(/^@+/, "").toLowerCase();
  return /^[a-z0-9_]{3,64}$/.test(nick) ? nick : null;
}

export const accountsByTgSql = (nick: string): string =>
  `SELECT DISTINCT account_id FROM yuplink.users
    WHERE lower(telegram_username) = ${sqlStr(nick)} AND account_id IS NOT NULL;`;

/** Дописать право creator аккаунту (уже есть — ничего не меняется). */
export function grantCreatorSql(account: string): string {
  const acc = sqlStr(account);
  return `UPDATE yuplink.settings
     SET value = (value::jsonb || jsonb_build_object(${acc},
           COALESCE(value::jsonb -> ${acc}, '[]'::jsonb) || '["creator"]'::jsonb))::text
   WHERE key = 'admin_rights'
     AND NOT COALESCE(value::jsonb -> ${acc}, '[]'::jsonb) ? 'creator';`;
}

/** Добавить креатора по нику Telegram: аккаунт и подпись. */
export async function addCreatorByTg(raw: string): Promise<{ account: string; name: string }> {
  const nick = cleanTgNick(raw);
  if (!nick) throw new Error("creator.tg_bad");
  const rows = ((await mcpExec(accountsByTgSql(nick), { wrapJson: true })) ?? []) as Array<{
    account_id: string;
  }>;
  if (rows.length === 0) throw new Error("creator.tg_not_found");
  if (rows.length > 1) throw new Error("creator.tg_many");
  const account = rows[0].account_id;
  await mcpExec(
    `INSERT INTO yuplink.settings (key, value)
       SELECT 'admin_rights', '{}' WHERE NOT EXISTS
         (SELECT 1 FROM yuplink.settings WHERE key = 'admin_rights');`,
    { wrapJson: false },
  );
  await mcpExec(grantCreatorSql(account), { wrapJson: false });
  const { dropAdminRightsCache } = await import("@/server/admin-rights");
  dropAdminRightsCache();
  const names = await namesOf([account]);
  return { account, name: names.get(account) ?? `@${nick}` };
}

/**
 * Каталог: все креаторы и все, у кого есть миры, — с их мирами (портфолио).
 * Креаторы без миров тоже в списке. Сначала у кого больше миров.
 */
export async function creatorTeam(adminAccount: string): Promise<CreatorMember[]> {
  const { accountsWithRight } = await import("@/server/admin-rights");
  const [creators, works] = await Promise.all([
    accountsWithRight("creator"),
    listWorks(adminAccount, true),
  ]);
  const ids = new Set<string>([...creators, ...works.map((w) => w.ownerAccount)]);
  const names = await namesOf([...ids]);
  const isCreator = new Set(creators);
  return [...ids]
    .map((account) => ({
      account,
      name: names.get(account) ?? account,
      creator: isCreator.has(account),
      works: works.filter((w) => w.ownerAccount === account),
    }))
    .sort((a, b) => b.works.length - a.works.length || a.name.localeCompare(b.name));
}
