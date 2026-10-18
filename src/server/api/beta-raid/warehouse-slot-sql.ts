// Снять с полки склада и вернуть на неё — вместе с метками происхождения.
//
// Вынесено из warehouse-take.ts ради лимита ≤250 строк. Метки живут по тому же
// правилу, что у рюкзака (stack-origin): с полки уходит сначала безымянное,
// мобы — последними; откат возвращает ровно ушедшие метки, не больше штук.
//
// Метки хранит только ЛИЧНАЯ полка (владелец, 29.09.2026): общая — не «моя»,
// забранное с неё приходит безымянным. Её запись (keep = false) метки обнуляет
// — заодно гаснут метки, оставшиеся на общих полках до этого правила.
import {
  NO_ORIGIN,
  originCols,
  originGrowSql,
  originLit,
  originSetSql,
  originTakeSql,
  originTakenSql,
  originZeroSetSql,
  type OriginQty,
} from "@/server/api/beta-raid/stack-origin";

/** Допуск точного списания: столько double может разойтись с numeric. */
const NOISE = "0.000000001";

/** Строка ответа снятия: вид для выдачи и сколько каких меток ушло. */
export type SlotTakeRow = {
  kind: string;
  refId: string | null;
  name: string;
  image: string | null;
  mobTaken: number | string | null;
  mineTaken: number | string | null;
  fieldTaken: number | string | null;
  lootTaken?: number | string | null;
  /** Износ, ушедший со стопкой (снята вся — tool-wear-move). */
  wearTaken?: number | string | null;
};

/**
 * Снять fits штук с полки. where и mine — условие строки (клетка, вид, чья
 * полка). Двое за одной общей полкой не снимут больше, чем лежит: условие —
 * в самом UPDATE. Прежние числа читаются под FOR UPDATE, как у рюкзака
 * (market-backpack-take): RETURNING видит только новую строку, а ушедшие
 * метки считаются от прежней. keep = false — общая полка: меток нет ни на
 * ней, ни в снятом. Снята вся стопка — износ уходит с ней (tool-wear-move),
 * часть — уходят целые штуки, износ остаётся на полке.
 */
export function takeSlotSql(where: string, mine: string, fits: number, keep = true): string {
  const left = `GREATEST(0, ROUND(w.count - ${fits}, 9))`;
  const taken = keep
    ? originTakenSql(
        {
          count: "o.old_count",
          mob: "o.old_mob",
          mine: "o.old_mine",
          field: "o.old_field",
          loot: "o.old_loot",
        },
        originCols("w."),
      )
    : originLit(NO_ORIGIN);
  const marks = keep ? originSetSql(originTakeSql(originCols("w."), left)) : originZeroSetSql();
  return `UPDATE yuplink.raid_warehouse_slot w
      SET count = ${left}, ${marks},
          wear = CASE WHEN ${left} < 1 THEN 0 ELSE w.wear END,
          updated_at = now()
     FROM (SELECT id, count AS old_count, mob_count AS old_mob, wear AS old_wear,
                  mine_count AS old_mine, field_count AS old_field, loot_count AS old_loot
             FROM yuplink.raid_warehouse_slot
            WHERE ${where} AND ${mine}
              FOR UPDATE) o
    WHERE w.id = o.id AND w.count - ${fits} > -${NOISE}
    RETURNING w.kind, w.ref_id AS "refId", w.name, w.image,
              ${taken.mob} AS "mobTaken", ${taken.mine} AS "mineTaken",
              ${taken.field} AS "fieldTaken", ${taken.loot} AS "lootTaken",
              CASE WHEN w.count < 1 THEN o.old_wear ELSE 0 END AS "wearTaken";`;
}

/**
 * Вернуть fits штук на ту же полку с их метками — откат, когда рюкзак или
 * счёт не приняли. Только своя строка (where + mine): у «своего» без хозяина
 * в условии откат прибавлял бы всем, у кого этот вид на личной полке. Общая
 * полка (keep = false) меток не получает.
 */
export function backToSlotSql(
  where: string,
  mine: string,
  fits: number,
  origin: OriginQty,
  keep = true,
): string {
  const marks = keep
    ? originSetSql(originGrowSql(originCols(), originLit(origin), `count + ${fits}`))
    : originZeroSetSql();
  return `UPDATE yuplink.raid_warehouse_slot
      SET count = count + ${fits},
          ${marks},
          updated_at = now()
    WHERE ${where} AND ${mine};`;
}
