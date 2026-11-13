// Лестница в операторе шага (move-step-sql, §8.121): лок рюкзака героя
// отдельным оператором до WITH (как у зелий), строка лестницы FOR UPDATE —
// шаг пишется только при ней (casPos … WHERE EXISTS lsrc), и тратится она
// только за применённый шаг (FROM pos). Комментарии внутри SQL — блочные.
import { sqlStr } from "@/server/api/raid-shared";
import { originCols, originSetSql, originTakeSql } from "@/server/api/beta-raid/stack-origin";
import { LADDER_GOLD } from "@/lib/raid/sight";

/**
 * acc — аккаунт уже в кавычках; op — ключ нажатия шага. Золото (LADDER_GOLD) —
 * res_move за применённый шаг (FROM pos); не хватает — исключение «в минус»
 * роняет весь оператор: ни шага, ни лестницы, ни энергии.
 */
export function ladderCtes(
  heroId: string,
  acc: string,
  op: string,
): { lock: string; src: string; take: string } {
  const hero = sqlStr(heroId);
  const left = "(s.count - 1)";
  return {
    lock: `SELECT pg_advisory_xact_lock(hashtext(${sqlStr(`bp:${heroId}`)})) AS l;`,
    src: `lsrc AS (
             SELECT h.id, h.count
               FROM yuplink.raid_hero_backpack h
               JOIN yuplink.raid_custom_item ci ON ci.id = h.ref_id AND ci.is_ladder
              WHERE h.hero_id = ${hero} AND h.kind = 'custom' AND h.count >= 1
              ORDER BY h.count DESC, h.id
              LIMIT 1
                FOR UPDATE OF h
           )`,
    take: `lupd AS (
             UPDATE yuplink.raid_hero_backpack h
                SET count = ${left}, ${originSetSql(originTakeSql(originCols("h."), left))},
                    updated_at = now()
               FROM lsrc s
              WHERE h.id = s.id AND s.count > 1 AND EXISTS (SELECT 1 FROM pos)
             RETURNING h.id
           ),
           ldel AS (
             DELETE FROM yuplink.raid_hero_backpack h USING lsrc s
              WHERE h.id = s.id AND s.count <= 1 AND EXISTS (SELECT 1 FROM pos)
             RETURNING h.id
           ),
           lgold AS (
             SELECT g.applied FROM pos
              CROSS JOIN LATERAL yuplink.res_move(${acc}, 'gold', ${-LADDER_GOLD}, 'ladder',
                                                  ${sqlStr(`ladder:${op}`)}) g
           )`,
  };
}
