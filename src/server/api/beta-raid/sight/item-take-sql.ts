// Списать N штук «товара с галочкой» (бинокль, лестница) из рюкзака героя
// под ключом нажатия — та же схема, что у зелий (potion-drink-sql.ts):
// лок рюкзака `bp:<герой>` отдельным оператором до WITH, ключ hero_boost_op
// той же вставкой, что списание; повтор моста узнаёт себя по метке `mark`.
//
// Отдаёт CTE `src`, `mark`, `upd`, `del` — вызывающий дописывает свои CTE
// под условием TAKE_GATE и итоговый SELECT. Комментарии внутри SQL — блочные.
import { sqlStr } from "@/server/api/raid-shared";
import { originCols, originSetSql, originTakeSql } from "@/server/api/beta-raid/stack-origin";

/** Галочки товара, которые тратятся «Применить». */
export type UseFlag = "is_binocular" | "is_ladder";

export type TakeInput = {
  op: string;
  mark: string;
  heroId: string;
  flag: UseFlag;
  qty: number;
  /** Подпись в hero_boost_op.stat. */
  stat: string;
};

/** Условие «ключ занят этим выполнением» — для CTE вызывающего. */
export const TAKE_GATE = "EXISTS (SELECT 1 FROM mark)";

export const takeLockSql = (heroId: string): string =>
  `SELECT pg_advisory_xact_lock(hashtext(${sqlStr(`bp:${heroId}`)})) AS l;`;

export function takeCtes(o: TakeInput): string[] {
  const hero = sqlStr(o.heroId);
  const op = sqlStr(o.op);
  const n = Math.max(1, Math.floor(o.qty));
  const left = `(s.count - ${n})`;
  return [
    `prior AS (
       SELECT b.source FROM yuplink.hero_boost_op b WHERE b.op = ${op}
     )`,
    `src AS (
       SELECT h.id, h.count
         FROM yuplink.raid_hero_backpack h
         JOIN yuplink.raid_custom_item ci ON ci.id = h.ref_id AND ci.${o.flag}
        WHERE h.hero_id = ${hero} AND h.kind = 'custom' AND h.count >= ${n}
          AND NOT EXISTS (SELECT 1 FROM prior)
        ORDER BY h.count DESC, h.id
        LIMIT 1
          FOR UPDATE OF h
     )`,
    `mark AS (
       INSERT INTO yuplink.hero_boost_op (op, hero_id, stat, amount, source)
       SELECT ${op}, ${hero}, ${sqlStr(o.stat)}, ${n}, ${sqlStr(o.mark)}
        WHERE EXISTS (SELECT 1 FROM src)
       ON CONFLICT (op) DO NOTHING
       RETURNING op
     )`,
    `upd AS (
       UPDATE yuplink.raid_hero_backpack h
          SET count = ${left}, ${originSetSql(originTakeSql(originCols("h."), left))},
              updated_at = now()
         FROM src s
        WHERE h.id = s.id AND s.count > ${n} AND ${TAKE_GATE}
       RETURNING h.id
     )`,
    `del AS (
       DELETE FROM yuplink.raid_hero_backpack h USING src s
        WHERE h.id = s.id AND s.count <= ${n} AND ${TAKE_GATE}
       RETURNING h.id
     )`,
  ];
}

/** Поля ответа о списании — в итоговый SELECT вызывающего. */
export const TAKE_FIELDS = `(SELECT source FROM prior) AS prior,
              EXISTS (SELECT 1 FROM mark) AS fresh,
              EXISTS (SELECT 1 FROM src) AS had`;

export type TakeRow = { prior: string | null; fresh: boolean; had: boolean };
