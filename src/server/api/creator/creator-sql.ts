// SQL работ креатора (миграция creator-01): список, доступ, запись, общий
// доступ и точка возврата. Только тексты — исполняют creator-store и
// creator-move.
import { sqlStr } from "@/server/api/raid-shared";
import type { Cell } from "@/lib/raid/worldgen/geo";

const json = (v: unknown) => `${sqlStr(JSON.stringify(v))}::jsonb`;

/** Видна ли работа аккаунту: своя или открытая ему (`w` — raid_creator_work). */
export const workSeenSql = (account: string): string => {
  const acc = sqlStr(account);
  return `(w.owner_account = ${acc} OR EXISTS (
    SELECT 1 FROM yuplink.raid_creator_share s
     WHERE s.map_id = w.map_id AND s.account_id = ${acc}))`;
};

/** Моя роль в работе (`w`): owner — автор, edit/view — открыта мне, null — не моя. */
const myRoleSql = (account: string): string => {
  const acc = sqlStr(account);
  return `CASE WHEN w.owner_account = ${acc} THEN 'owner'
              ELSE (SELECT s.role FROM yuplink.raid_creator_share s
                     WHERE s.map_id = w.map_id AND s.account_id = ${acc}) END`;
};

/** Колонки работы для списка и для одной работы: размер, моя роль, кому открыта. */
const workColsSql = (account: string): string => `w.map_id, w.name, w.owner_account, w.places,
          COALESCE(m.size, 64) AS size,
          extract(epoch from w.updated_at) * 1000 AS updated_ms,
          ${myRoleSql(account)} AS my_role,
          COALESCE((SELECT jsonb_agg(jsonb_build_object('account', s.account_id, 'role', s.role)
                                     ORDER BY s.created_at)
                      FROM yuplink.raid_creator_share s WHERE s.map_id = w.map_id),
                   '[]'::jsonb) AS shared`;

/**
 * Работы аккаунта, свежие сверху: свои и общие. all — админ (владелец игры)
 * видит все.
 */
export function worksListSql(account: string, all = false): string {
  return `SELECT ${workColsSql(account)}
     FROM yuplink.raid_creator_work w
     JOIN yuplink.raid_maps m ON m.id = w.map_id
    WHERE ${all ? "true" : workSeenSql(account)}
    ORDER BY w.updated_at DESC, w.map_id
    LIMIT 500;`;
}

/** Работа, если она видна аккаунту (all — админу любая): с ролью и размером. */
export function workSql(mapId: string, account: string, all = false): string {
  return `SELECT ${workColsSql(account)}
     FROM yuplink.raid_creator_work w
     JOIN yuplink.raid_maps m ON m.id = w.map_id
    WHERE w.map_id = ${sqlStr(mapId)} AND ${all ? "true" : workSeenSql(account)}
    LIMIT 1;`;
}

/** Править работу может автор и тот, кому она открыта на редакцию. */
export function workEditSql(mapId: string, account: string): string {
  const acc = sqlStr(account);
  return `SELECT 1 AS ok FROM yuplink.raid_creator_work w
    WHERE w.map_id = ${sqlStr(mapId)}
      AND (w.owner_account = ${acc} OR EXISTS (
        SELECT 1 FROM yuplink.raid_creator_share s
         WHERE s.map_id = w.map_id AND s.account_id = ${acc} AND s.role = 'edit'))
    LIMIT 1;`;
}

/** Вход в мир креатора: свой мир, в котором был последним (вход его отмечает). */
export const lastOwnSql = (account: string): string =>
  `SELECT w.map_id FROM yuplink.raid_creator_work w
    WHERE w.owner_account = ${sqlStr(account)}
    ORDER BY w.updated_at DESC, w.map_id LIMIT 1;`;

/** Строка новой работы (карта уже записана). */
export function insertWorkSql(o: {
  mapId: string;
  name: string;
  owner: string;
  spawn: Cell;
}): string {
  return `INSERT INTO yuplink.raid_creator_work (map_id, name, owner_account, places)
    VALUES (${sqlStr(o.mapId)}, ${sqlStr(o.name)}, ${sqlStr(o.owner)},
            ${json({ spawn: { q: o.spawn.q, r: o.spawn.r } })});`;
}

/** Переименовать: и работу, и её карту (имя карты видно в шапке). */
export function renameWorkSql(mapId: string, name: string): string[] {
  const m = sqlStr(mapId);
  return [
    `UPDATE yuplink.raid_creator_work SET name = ${sqlStr(name)}, updated_at = now()
      WHERE map_id = ${m};`,
    `UPDATE yuplink.raid_maps SET name = ${sqlStr(name)}, updated_at = now() WHERE id = ${m};`,
  ];
}

/** Роль другого креатора в работе: view — только смотреть, edit — править вместе. */
export type ShareRole = "view" | "edit";

/** Открыть работу креатору с ролью, сменить роль или закрыть доступ (null). */
export function shareSql(mapId: string, account: string, role: ShareRole | null): string {
  const m = sqlStr(mapId);
  const acc = sqlStr(account);
  return role
    ? `INSERT INTO yuplink.raid_creator_share (map_id, account_id, role)
        VALUES (${m}, ${acc}, ${sqlStr(role)})
        ON CONFLICT (map_id, account_id) DO UPDATE SET role = EXCLUDED.role;`
    : `DELETE FROM yuplink.raid_creator_share WHERE map_id = ${m} AND account_id = ${acc};`;
}

/** Отметка «работали» — список держит свежие сверху. */
export const touchWorkSql = (mapId: string): string =>
  `UPDATE yuplink.raid_creator_work SET updated_at = now() WHERE map_id = ${sqlStr(mapId)};`;

/** Запомнить, откуда креатор пришёл в работы. */
export function saveBackSql(account: string, at: Cell & { mapId: string }): string {
  return `INSERT INTO yuplink.raid_creator_back (account_id, map_id, q, r, updated_at)
    VALUES (${sqlStr(account)}, ${sqlStr(at.mapId)}, ${Math.trunc(at.q)}, ${Math.trunc(at.r)}, now())
    ON CONFLICT (account_id) DO UPDATE
      SET map_id = EXCLUDED.map_id, q = EXCLUDED.q, r = EXCLUDED.r, updated_at = now();`;
}

export const backSql = (account: string): string =>
  `SELECT map_id, q, r FROM yuplink.raid_creator_back WHERE account_id = ${sqlStr(account)} LIMIT 1;`;
