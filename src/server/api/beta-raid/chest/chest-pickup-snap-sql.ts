// «Забрать сундук» (магический) в SQL: снимок для плана одним запросом и общие
// с записью куски — где сундук, отпечатки рюкзака и сети, охрана, «последний»,
// журнал нажатия. Запись — chest-pickup-sql.ts: она сверяет ровно эти
// выражения, поэтому они живут в одном месте.
import { sqlStr } from "@/server/api/raid-shared";
import { IS_POTION_SQL, POTION_JOIN } from "@/server/api/beta-raid/potion-bag";

/**
 * Клетка, хозяин сундука (owner), кто снимает (account) и его герой. Хозяин
 * снимает свой — owner = account; чужой (четвёртая редакция, 29.09) — нет.
 */
export type PickupWho = {
  mapId: string;
  q: number;
  r: number;
  owner: string;
  account: string;
  heroId: string;
};

export const atCell = (a: string, o: PickupWho): string =>
  `${a}.map_id = ${sqlStr(o.mapId)} AND ${a}.q = ${o.q} AND ${a}.r = ${o.r}`;

/** Отпечаток: ключ и количество каждого стека по порядку ключей. */
const fpSql = (table: string, a: string, where: string): string =>
  `(SELECT md5(COALESCE(string_agg(${a}.stack_key || '=' || ${a}.count::text, ','
                                   ORDER BY ${a}.stack_key), ''))
      FROM ${table} ${a} WHERE ${where} AND ${a}.count > 0)`;

/** Рюкзак героя снимающего. */
export const bagFpSql = (o: PickupWho) =>
  fpSql("yuplink.raid_hero_backpack", "b", `b.hero_id = ${sqlStr(o.heroId)}`);
/** Сеть хозяина — одна на все его сундуки. */
export const netFpSql = (o: PickupWho) =>
  fpSql("yuplink.raid_chest_slot", "s", `s.account_id = ${sqlStr(o.owner)}`);

/** Незакопанный сундук хозяина на клетке; potion — галочка «зелье» у его товара. */
export const chestSql = (o: PickupWho) =>
  `SELECT mc.item_id AS "itemId", mc.name, mc.image, COALESCE(ci.is_potion, false) AS potion
     FROM yuplink.raid_magic_chest mc
     LEFT JOIN yuplink.raid_custom_item ci ON ci.id = mc.item_id
    WHERE ${atCell("mc", o)} AND mc.owner_account = ${sqlStr(o.owner)} AND mc.buried_at IS NULL`;

/** Живая охрана хозяина на клетке; whole — на полном HP (только такая вернётся). */
export const guardSql = (o: PickupWho) =>
  `SELECT g.boss_template_id AS tpl, g.name, g.image, (g.current_hp >= g.max_hp) AS whole
     FROM yuplink.raid_mine_guard g
    WHERE ${atCell("g", o)} AND g.owner_account = ${sqlStr(o.owner)}
      AND g.killed_at IS NULL AND g.current_hp > 0`;

/** На клетке стоит живой охранник (чей угодно): чужому — сначала бой. */
export const guardedSql = (o: PickupWho) =>
  `EXISTS (SELECT 1 FROM yuplink.raid_mine_guard g
            WHERE ${atCell("g", o)} AND g.killed_at IS NULL AND g.current_hp > 0)`;

/** Других сундуков хозяина нет ни на одной карте (закопанный — тоже стоит, §8.15). */
export const lastSql = (o: PickupWho) =>
  `NOT EXISTS (SELECT 1 FROM yuplink.raid_magic_chest oc
                WHERE oc.owner_account = ${sqlStr(o.owner)} AND NOT (${atCell("oc", o)}))`;

/** Снимок для плана: сундук, охрана, рюкзак, сеть и отпечатки — одним чтением. */
export function pickupSnapSql(o: PickupWho): string {
  return `SELECT row_to_json(_t.*) AS _row FROM (
       SELECT (SELECT row_to_json(c.*) FROM (${chestSql(o)}) c LIMIT 1) AS chest,
              (SELECT row_to_json(g.*) FROM (${guardSql(o)}) g LIMIT 1) AS guard,
              ${guardedSql(o)} AS guarded,
              ${lastSql(o)} AS last,
              (SELECT COALESCE(json_agg(json_build_object(
                        'stackKey', b.stack_key, 'count', b.count, 'potion', ${IS_POTION_SQL})), '[]')
                 FROM yuplink.raid_hero_backpack b ${POTION_JOIN}
                WHERE b.hero_id = ${sqlStr(o.heroId)} AND b.count > 0) AS bag,
              (SELECT COALESCE(json_agg(json_build_object(
                        'stackKey', s.stack_key, 'kind', s.kind, 'refId', s.ref_id,
                        'itemId', s.item_id, 'name', s.name, 'image', s.image, 'count', s.count,
                        'potion', COALESCE(ci.is_potion, false)) ORDER BY s.stack_key), '[]')
                 FROM yuplink.raid_chest_slot s
                 LEFT JOIN yuplink.raid_custom_item ci
                        ON s.kind = 'custom' AND ci.id = split_part(s.stack_key, ':', 2)
                WHERE s.account_id = ${sqlStr(o.owner)} AND s.count > 0) AS net,
              ${bagFpSql(o)} AS bag_fp,
              ${netFpSql(o)} AS net_fp
     ) _t;`;
}

/** Журнал «Забрать сундук» по ключу нажатия (id выводится из ключа). */
export const pickupIdSql = (op: string): string => `'pku_' || md5(${sqlStr(op)})`;

/** Ключ мешочка с остатком: одно нажатие — один мешочек. */
export const leftoverKeyOf = (op: string): string => `mcpick:${op}`;

/** Журнал нажатия снимающего: что было в сети, что из неё легло и чей был сундук. */
export function pickupDoneSql(account: string, op: string): string {
  return `SELECT p.items, p.taken, p.owner_account FROM yuplink.raid_chest_plunder p
           WHERE p.id = ${pickupIdSql(op)} AND p.raider_account = ${sqlStr(account)}
           LIMIT 1`;
}
