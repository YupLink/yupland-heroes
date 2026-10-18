// SQL «Копать» на пустой земле (ПРАВИЛА §8.24): можно ли копать клетку и
// ключ нажатия.
//
// Копать можно только там, где можно стоять: есть местность и она не вода, нет
// декора (под деревом — сначала рубка), здания (и всей площади большого —
// владелец 03.10: «копать под зданиями нельзя»), объекта (живого или нет —
// объект занимает клетку), мешочка, бугорка и сундука (там «Закопать» /
// «Выкопать»). Купол проверяет гейт вплотную (requireBagNear → requireNotVoid).
//
// Ключ нажатия — строка в raid_loot_bag_op (kind 'ground', мешочка нет —
// bag_id «ground:<карта>:<q>:<r>»; сборщик мешочков уберёт её через двое
// суток, как любые ключи): повтор того же нажатия второй раз не копает.
// Комментарии внутри SQL — только блочные.
import { sqlStr } from "@/server/api/raid-shared";
import { WATER_SQL, buildingHeldSql } from "@/server/api/beta-raid/cell-sql";
import { objectKnownSql } from "@/server/api/beta-raid/boss-snapshot";
import { livePortion } from "@/server/api/beta-raid/loot-bag/bag-sql";

type At = { mapId: string; q: number; r: number };

/** Отказ «здесь копать нельзя» — ключом словаря. */
export const CANT_DIG = "dig.cant_here";

const cellAt = (a: string, o: At): string =>
  `${a}.map_id = ${sqlStr(o.mapId)} AND ${a}.q = ${Math.floor(o.q)} AND ${a}.r = ${Math.floor(o.r)}`;

/**
 * Одна строка: ok — копать можно. Клетки нет в карте — строк нет (нельзя).
 * Таблица шаблонов обязана называться `t` (WATER_SQL).
 */
export function groundCellSql(o: At): string {
  return `SELECT (c.terrain_id IS NOT NULL
            AND NOT COALESCE(${WATER_SQL}, false)
            AND c.decoration_id IS NULL
            AND NOT ${buildingHeldSql("c")}
            AND NOT (c.object_id IS NOT NULL AND ${objectKnownSql("c")})
            AND NOT EXISTS (SELECT 1 FROM yuplink.raid_loot_bag b
                             WHERE ${cellAt("b", o)}
                               AND EXISTS (SELECT 1 FROM yuplink.raid_loot_bag_item x
                                            WHERE x.bag_id = b.id AND ${livePortion("x")}))
            AND NOT EXISTS (SELECT 1 FROM yuplink.raid_plain_chest pc WHERE ${cellAt("pc", o)})
            AND NOT EXISTS (SELECT 1 FROM yuplink.raid_magic_chest mc WHERE ${cellAt("mc", o)})
            AND NOT EXISTS (SELECT 1 FROM yuplink.beta_raid_ship s WHERE ${cellAt("s", o)})
          ) AS ok
     FROM yuplink.raid_map_cells c
     LEFT JOIN yuplink.mystic_item_template t ON t.id = c.terrain_id
    WHERE ${cellAt("c", o)}
    LIMIT 1;`;
}

type Mark = At & { op: string; account: string };

const lockSql = (op: string): string =>
  `SELECT pg_advisory_xact_lock(hashtext(${sqlStr(`gdig:${op}`)})) AS l;`;

const refOf = (o: At): string => sqlStr(`ground:${o.mapId}:${Math.floor(o.q)}:${Math.floor(o.r)}`);

/**
 * Копка состоялась: ключ нажатия 'done' под локом ключа. nonce — вызова ручки:
 * mine («запись моя, плата не лишняя») верно и на слепом повторе моста (тот же
 * текст), а у параллельного дубля того же нажатия — нет, и он вернёт энергию.
 */
export function groundMarkSql(o: Mark & { nonce: string }): string {
  const [op, nonce] = [sqlStr(o.op), sqlStr(o.nonce)];
  return `${lockSql(o.op)}
     WITH prior AS (
       SELECT state, parts->>'nonce' AS nonce FROM yuplink.raid_loot_bag_op WHERE op = ${op}
     ),
     mark AS (
       INSERT INTO yuplink.raid_loot_bag_op (op, bag_id, account_id, kind, state, parts)
       SELECT ${op}, ${refOf(o)}, ${sqlStr(o.account)}, 'ground', 'done',
              jsonb_build_object('nonce', ${nonce})
        WHERE NOT EXISTS (SELECT 1 FROM prior)
       RETURNING state
     )
     SELECT row_to_json(_t.*) AS _row FROM (
       SELECT COALESCE((SELECT state FROM prior), (SELECT state FROM mark)) AS state,
              (EXISTS (SELECT 1 FROM mark)
               OR COALESCE((SELECT nonce FROM prior) = ${nonce}, false)) AS mine
     ) _t;`;
}

/**
 * «Забор» ключа, когда ответ groundMarkSql не пришёл: под тем же локом — ключ
 * с исходом 'failed', если его ещё нет. Опоздавшая запись уже не ляжет; ответ —
 * исход ключа ('done' — копка всё-таки записана).
 */
export function groundFenceSql(o: Mark): string {
  const op = sqlStr(o.op);
  return `${lockSql(o.op)}
     INSERT INTO yuplink.raid_loot_bag_op (op, bag_id, account_id, kind, state)
     VALUES (${op}, ${refOf(o)}, ${sqlStr(o.account)}, 'ground', 'failed')
     ON CONFLICT (op) DO NOTHING;
     SELECT row_to_json(_t.*) AS _row FROM (
       SELECT state FROM yuplink.raid_loot_bag_op WHERE op = ${op}
     ) _t;`;
}
