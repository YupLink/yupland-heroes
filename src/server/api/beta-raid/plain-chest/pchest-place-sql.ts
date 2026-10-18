// Установка обычного сундука — одним оператором «всё или ничего»: клетка,
// строка сундука и списание штуки из рюкзака.
//
// Правила клетки — как у магического сундука (chest-cell.ts cellFlagsSql):
// постройка, живой объект или беглец, вода, купол, любой сундук (и бугорок) и
// живая охрана держат клетку, мешочки — нет. Сундук ставят и на соседнюю
// клетку, поэтому держат её ещё декор, через который не пройти, и судно на
// берегу (cellExtraSql — общий с магическим, его тоже ставят на соседнюю).
//
// Локи — рюкзака героя и клетки, отдельными операторами до WITH (§8.15: лок
// внутри WITH не освежает снимок). Лок клетки общий с магическим сундуком.
// Строка рюкзака заперта FOR UPDATE; изношенная штука из рюкзака не уходит
// (§8.19). Ключ нажатия — в raid_plain_chest_op тем же оператором: повтор моста
// после коммита видит его и второй сундук не ставит. id сундука — от ключа.
//
// Без обёртки wrapJson: изменяющие CTE — верхний уровень. Комментарии внутри
// SQL — только блочные.
import { sqlStr } from "@/server/api/raid-shared";
import { originCols, originSetSql, originTakeSql } from "@/server/api/beta-raid/stack-origin";
import { locksSql } from "@/server/api/beta-raid/chest/chest-net-sql";
import {
  CELL_HELD,
  cellExtraSql,
  cellFlagsSql,
  cellLockKey,
} from "@/server/api/beta-raid/chest/chest-cell";

/** Остаток меньше тысячной — это вся штука: пыль ячейкой не висит. */
const DUST = 0.001;

/** Ответ установки: повтор, поставлено, и почему нет. */
export type PlaceRow = {
  was: boolean;
  placed: boolean;
  /** Клетки нет на карте — сундук не встанет. */
  cell: boolean;
  busy: boolean | null;
  box: boolean;
};

/** id сундука — выражением базы от ключа нажатия (повтор — тот же id). */
export const plainIdSql = (op: string): string => `'pc_' || md5(${sqlStr(op)})`;

export function placePlainSql(o: {
  mapId: string;
  q: number;
  r: number;
  account: string;
  heroId: string;
  itemId: string;
  name: string;
  image: string | null;
  stackKey: string;
  op: string;
}): string {
  const key = sqlStr(o.op);
  const b = originCols("b.");
  const held = CELL_HELD;
  return `${locksSql(`bp:${o.heroId}`, cellLockKey(o.mapId, o.q, o.r))}
     WITH prior AS (
       SELECT 1 FROM yuplink.raid_plain_chest_op WHERE op = ${key}
     ),
     f AS (${cellFlagsSql(o.mapId, o.q, o.r)}),
     ex AS (${cellExtraSql(o.mapId, o.q, o.r)}),
     /* Штука сундука: целая. Изношенная (wear > 0) остаётся в стопке — берём,
        только если после списания в ней останется хотя бы одна. */
     box AS (
       SELECT b.id FROM yuplink.raid_hero_backpack b
        WHERE b.hero_id = ${sqlStr(o.heroId)} AND b.stack_key = ${sqlStr(o.stackKey)}
          AND b.count >= 1 AND (b.wear = 0 OR b.count >= 2)
          FOR UPDATE
     ),
     go AS (
       SELECT 1 FROM f, ex, box
        WHERE NOT EXISTS (SELECT 1 FROM prior) AND NOT ${held}
     ),
     ins AS (
       INSERT INTO yuplink.raid_plain_chest (id, map_id, q, r, item_id, name, image, placed_by)
       SELECT ${plainIdSql(o.op)}, ${sqlStr(o.mapId)}, ${Math.floor(o.q)}, ${Math.floor(o.r)},
              ${sqlStr(o.itemId)}, ${sqlStr(o.name)}, ${o.image ? sqlStr(o.image) : "NULL"},
              ${sqlStr(o.account)}
         FROM go
       ON CONFLICT DO NOTHING
       RETURNING id
     ),
     upd AS (
       UPDATE yuplink.raid_hero_backpack b
          SET count = b.count - 1,
              ${originSetSql(originTakeSql(b, "b.count - 1"))},
              updated_at = now()
         FROM box, ins
        WHERE b.id = box.id AND b.count - 1 >= ${DUST}
       RETURNING 1
     ),
     del AS (
       DELETE FROM yuplink.raid_hero_backpack b USING box, ins
        WHERE b.id = box.id AND b.count - 1 < ${DUST} AND b.wear = 0
       RETURNING 1
     ),
     mark AS (
       INSERT INTO yuplink.raid_plain_chest_op (op, chest_id, account_id, kind, state, qty)
       SELECT ${key}, ins.id, ${sqlStr(o.account)}, 'place', 'done', 1 FROM ins
       RETURNING 1
     )
     SELECT row_to_json(_t.*) AS _row FROM (
       SELECT EXISTS (SELECT 1 FROM prior) AS was,
              EXISTS (SELECT 1 FROM ins) AS placed,
              EXISTS (SELECT 1 FROM f) AS cell,
              (SELECT ${held} FROM f, ex) AS busy,
              EXISTS (SELECT 1 FROM box) AS box
     ) _t;`;
}

/** Уборка ключей нажатий старше двух суток (повтор моста живёт секунды). */
export const opSweepSql = (): string =>
  `DELETE FROM yuplink.raid_plain_chest_op WHERE at < now() - interval '2 days';`;
