// «Забрать сундук» (обычный) в SQL: снимок одним запросом и запись одним
// оператором.
//
// Запись — под локами рюкзака героя и сундука (те же, что у «положить» и
// «забрать», pchest-move-sql), отдельными операторами до WITH. Она сверяет
// отпечатки рюкзака и ячеек сундука со снимком плана и только тогда снимает
// сундук и все его ячейки, кладёт в рюкзак ровно строки плана, остаток —
// мешочком на клетке (id от сундука, порции на 24 часа, без меток), и пишет
// ключ нажатия с итогом. Не сошлось — ничего не тронуто, план заново. Из пары
// «забрать сундук / положить-забрать товар» проходит одно: лок сундука общий.
//
// Без обёртки wrapJson: изменяющие CTE — верхний уровень. Комментарии внутри
// SQL — только блочные.
import { sqlStr } from "@/server/api/raid-shared";
import type { LootPick } from "@/lib/magicChest";
import { IS_POTION_SQL, POTION_JOIN } from "@/server/api/beta-raid/potion-bag";
import { originCols, originGrowSql, originSetSql } from "@/server/api/beta-raid/stack-origin";
import { locksSql } from "@/server/api/beta-raid/chest/chest-net-sql";
import type { PickupRow } from "@/server/api/beta-raid/chest/chest-pickup-plan";
import { leftoverBagSql } from "@/server/api/beta-raid/loot-bag/bag-leftover-sql";
import { plainAtSql } from "@/server/api/beta-raid/plain-chest/pchest-row";
import type { BaggedRow } from "@/server/api/beta-raid/plain-chest/pchest-pickup-plan";

/** Отпечаток: ключ и количество каждого стека по порядку ключей. */
const fpSql = (table: string, a: string, where: string): string =>
  `(SELECT md5(COALESCE(string_agg(${a}.stack_key || '=' || ${a}.count::text, ','
                                   ORDER BY ${a}.stack_key), ''))
      FROM ${table} ${a} WHERE ${where} AND ${a}.count > 0)`;

const bagFp = (heroId: string) =>
  fpSql("yuplink.raid_hero_backpack", "b", `b.hero_id = ${sqlStr(heroId)}`);
const slotFp = (chestIdSql: string) =>
  fpSql("yuplink.raid_plain_chest_slot", "s", `s.chest_id = ${chestIdSql}`);

/** Снимок для плана: сундук клетки, рюкзак героя, ячейки и отпечатки — одним чтением. */
export function pickupSnapSql(o: { mapId: string; q: number; r: number; heroId: string }): string {
  const id = `(SELECT pc.id FROM yuplink.raid_plain_chest pc WHERE ${plainAtSql("pc", o.mapId, o.q, o.r)})`;
  return `SELECT row_to_json(_t.*) AS _row FROM (
       SELECT (SELECT row_to_json(c.*) FROM (
                 SELECT pc.id, pc.item_id AS "itemId", pc.name, pc.image,
                        (pc.buried_at IS NOT NULL) AS buried,
                        COALESCE(ci.is_potion, false) AS potion
                   FROM yuplink.raid_plain_chest pc
                   LEFT JOIN yuplink.raid_custom_item ci ON ci.id = pc.item_id
                  WHERE ${plainAtSql("pc", o.mapId, o.q, o.r)}) c LIMIT 1) AS chest,
              (SELECT COALESCE(json_agg(json_build_object(
                        'stackKey', b.stack_key, 'count', b.count, 'potion', ${IS_POTION_SQL})), '[]')
                 FROM yuplink.raid_hero_backpack b ${POTION_JOIN}
                WHERE b.hero_id = ${sqlStr(o.heroId)} AND b.count > 0) AS bag,
              (SELECT COALESCE(json_agg(json_build_object(
                        'stackKey', s.stack_key, 'kind', s.kind, 'refId', s.ref_id,
                        'itemId', s.item_id, 'name', s.name, 'image', s.image, 'count', s.count,
                        'potion', COALESCE(ci.is_potion, false)) ORDER BY s.stack_key), '[]')
                 FROM yuplink.raid_plain_chest_slot s
                 LEFT JOIN yuplink.raid_custom_item ci
                        ON s.kind = 'custom' AND ci.id = split_part(s.stack_key, ':', 2)
                WHERE s.chest_id = ${id} AND s.count > 0) AS slots,
              ${bagFp(o.heroId)} AS bag_fp,
              ${slotFp(id)} AS slot_fp
     ) _t;`;
}

/** Ответ записи: повтор (итог прошлого нажатия), сделано, и почему нет. */
export type PickupWriteRow = {
  prior: unknown;
  picked: boolean;
  here: boolean;
  buried: boolean | null;
  fresh: boolean | null;
  bag_id: string | null;
};

/** Ключ мешочка с остатком: один сундук — один мешочек (id сундука от установки). */
export const leftoverKey = (chestId: string): string => `pchest:${chestId}`;

/**
 * Записать план. expect — отпечатки снимка, по которому он посчитан; taken —
 * что из сундука легло в рюкзак (для итога), bagged — остаток в мешочек.
 */
export function pickupWriteSql(o: {
  chestId: string;
  heroId: string;
  account: string;
  op: string;
  expect: { bagFp: string; slotFp: string };
  rows: readonly PickupRow[];
  taken: readonly LootPick[];
  bagged: readonly BaggedRow[];
}): string {
  const [id, acc, op] = [sqlStr(o.chestId), sqlStr(o.account), sqlStr(o.op)];
  const json = (v: unknown) => `${sqlStr(JSON.stringify(v))}::jsonb`;
  const old = originCols("yuplink.raid_hero_backpack.");
  const picks = o.bagged.map((b) => ({ stackKey: b.k, qty: b.n }));
  return `${locksSql(`bp:${o.heroId}`, `pchest:${o.chestId}`)}
     WITH prior AS (
       SELECT result FROM yuplink.raid_plain_chest_op WHERE op = ${op}
     ),
     ch AS (
       SELECT c.id, (c.buried_at IS NOT NULL) AS buried FROM yuplink.raid_plain_chest c
        WHERE c.id = ${id}
     ),
     fresh AS (
       SELECT (${bagFp(o.heroId)} = ${sqlStr(o.expect.bagFp)}
               AND ${slotFp(id)} = ${sqlStr(o.expect.slotFp)}) AS ok
     ),
     go AS (
       SELECT 1 FROM ch, fresh
        WHERE NOT EXISTS (SELECT 1 FROM prior) AND NOT ch.buried AND fresh.ok
     ),
     del_ch AS (
       DELETE FROM yuplink.raid_plain_chest c USING go
        WHERE c.id = ${id} AND c.buried_at IS NULL
       RETURNING c.map_id, c.q, c.r, c.name
     ),
     del_s AS (
       DELETE FROM yuplink.raid_plain_chest_slot s USING del_ch
        WHERE s.chest_id = ${id}
       RETURNING 1
     ),
     /* Сундук и его товары — без меток (сундук общий, §8.18); прежние метки
        стека рюкзака остаются, не больше нового count. */
     put AS (
       INSERT INTO yuplink.raid_hero_backpack
          (id, hero_id, account_id, kind, ref_id, item_id, stack_key, name, image, count,
           mob_count, mine_count, field_count, loot_count)
       SELECT 'bp_' || substr(md5(${op} || ':' || x.k), 1, 20), ${sqlStr(o.heroId)}, ${acc},
              x.kind, x.ref, x.item, x.k, x.name, x.image, x.qty, 0, 0, 0, 0
         FROM del_ch,
              jsonb_to_recordset(${json(o.rows)}) AS x(k text, kind text, ref text, item text,
                                                     name text, image text, qty numeric, loot numeric)
       ON CONFLICT (hero_id, stack_key) DO UPDATE
         SET count = yuplink.raid_hero_backpack.count + EXCLUDED.count,
             ${originSetSql(originGrowSql(old, originCols("EXCLUDED.")))},
             updated_at = now()
       RETURNING 1
     ),
     ${leftoverBagSql({ key: leftoverKey(o.chestId), account: o.account, from: "del_ch", bagged: o.bagged })}
     mark AS (
       INSERT INTO yuplink.raid_plain_chest_op (op, chest_id, account_id, kind, state, result)
       SELECT ${op}, ${id}, ${acc}, 'pickup', 'done',
              jsonb_build_object('taken', ${json(o.taken)}, 'bagged', ${json(picks)},
                                 'bagId', (SELECT id FROM bag))
         FROM del_ch
       RETURNING 1
     )
     SELECT row_to_json(_t.*) AS _row FROM (
       SELECT (SELECT result FROM prior) AS prior,
              EXISTS (SELECT 1 FROM mark) AS picked,
              EXISTS (SELECT 1 FROM ch) AS here,
              (SELECT buried FROM ch) AS buried,
              (SELECT ok FROM fresh) AS fresh,
              (SELECT id FROM bag) AS bag_id
     ) _t;`;
}
