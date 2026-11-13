// SQL «рюкзак сданного героя — мешочком на клетку основного» (владелец, 23.10.2026;
// ПРАВИЛА §8.73 п. 4): «если продавать и что-то есть в рюкзаке … ничего не
// перекладывается — всё падает … выпадать должно на той же клетке, где стоит
// основной герой».
//
// Одной строкой запроса (одна транзакция) с отметкой «оплачено» (markPaidSql идёт
// первым в той же строке): снимок закрыт — и рюкзак тут же высыпан; упало — ни
// того, ни другого, откат сделки вернёт героя вместе с рюкзаком (строки рюкзака
// живут по id экземпляра, снятие героя их не трогает).
//
// Высыпаем только у героев, чьи снимки оплачены и не возвращены, а экземпляра
// с тем же id нет (вернули — рюкзак снова его). Как «Выбросить» (bag-discard-sql):
// локи рюкзаков, клетки и мешочка — до WITH; порция 24 часа, метки едут с ней;
// изношенная штука инструмента сгорает, в мешочек — целые. Одинаковые стопки
// разных героев — одной порцией (метки складываются, как при доливе). Надетые
// артефакты — туда же, порциями «art:<id>» (снимок предмета — raid_loot_bag_art).
import { sqlStr } from "@/server/api/raid-shared";
import { ORIGINS, originCols, originTakeSql } from "@/server/api/beta-raid/stack-origin";
import { ITEM_COLS, PORTION_TTL, livePortion } from "@/server/api/beta-raid/loot-bag/bag-sql";
import { newBagIdSql, notFishSql } from "@/server/api/beta-raid/loot-bag/bag-discard-sql";
import { PAWN_HERO_TAKE } from "./hero-pawn-sql";

/** Строка ответа: стопка, легшая в мешочек (нет строк — высыпать было нечего). */
export type PawnDropRow = {
  stack_key: string;
  kind: string | null;
  ref_id: string | null;
  name: string | null;
  image: string | null;
  put: number | string;
  bag_id: string;
  fresh: boolean;
};

/** Снимки сделки: id экземпляра (спящий — null) и надетое на нём. */
export const pawnSnapsSql = (ops: string[]): string =>
  `SELECT p.instance->>'id' AS hero_id, p.instance->'equipped' AS equipped
     FROM ${PAWN_HERO_TAKE} p
    WHERE p.op IN (${ops.map(sqlStr).join(", ")}) AND p.restored_at IS NULL;`;

/**
 * Высыпать рюкзаки героев сделок ops в мешочек клетки (bagId — живой кандидат,
 * key — ключ нового). Героев выводит сам запрос из снимков: отдельное чтение
 * могло сорваться, и снимок закрылся бы оплатой без высыпания (рюкзак — ничей).
 */
export function pawnDropSql(o: {
  ops: string[];
  account: string;
  mapId: string;
  q: number;
  r: number;
  bagId: string | null;
  key: string;
}): string {
  const [q, r] = [Math.floor(o.q), Math.floor(o.r)];
  const lockId = o.bagId ? sqlStr(o.bagId) : newBagIdSql(o.key);
  const cand = o.bagId ? sqlStr(o.bagId) : "NULL";
  const ops = o.ops.map(sqlStr).join(", ");
  // Целые штуки: у стопки с износом одна (изношенная) сгорает.
  const put = "GREATEST(0, g.count - CASE WHEN COALESCE(g.wear, 0) > 0 THEN 1 ELSE 0 END)";
  const marks = originTakeSql(originCols("g."), put);
  const sums = ORIGINS.map((k) => `SUM(${marks[k]}) AS ${k}`).join(", ");
  // Локи рюкзаков — по снимкам сделки, по порядку id (как takeHeroSql: функция
  // в списке выборки с ORDER BY считается после сортировки).
  const heroLocks = `SELECT pg_advisory_xact_lock(hashtext('bp:' || (p.instance->>'id'))) AS l
       FROM ${PAWN_HERO_TAKE} p
      WHERE p.op IN (${ops}) AND p.instance->>'id' IS NOT NULL
      ORDER BY p.instance->>'id';`;
  return `${heroLocks}
     SELECT pg_advisory_xact_lock(hashtext(${sqlStr(`lootdrop:${o.mapId}:${q}:${r}`)})) AS l;
     SELECT pg_advisory_xact_lock(hashtext('lootbag:' || ${lockId})) AS l;
     WITH heroes AS (
       SELECT DISTINCT p.instance->>'id' AS hero_id FROM ${PAWN_HERO_TAKE} p
        WHERE p.op IN (${ops}) AND p.instance->>'id' IS NOT NULL
          AND p.paid_at IS NOT NULL AND p.restored_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM yuplink.hero_instance hi WHERE hi.id = p.instance->>'id')
     ),
     ex AS (
       SELECT b.id FROM yuplink.raid_loot_bag b
        WHERE b.map_id = ${sqlStr(o.mapId)} AND b.q = ${q} AND b.r = ${r} AND b.buried_at IS NULL
          AND ${notFishSql("b")} /* рыба от динамита — не мешочек для рюкзака героя */
          AND EXISTS (SELECT 1 FROM yuplink.raid_loot_bag_item x WHERE x.bag_id = b.id AND ${livePortion("x")})
        ORDER BY (b.id = ${cand}) DESC NULLS LAST, b.created_at DESC
        LIMIT 1
     ),
     gone AS (
       /* Гриб DARAI в мешочек не кладут (§8.65) — с ним героя и не берут
          (pawnFreeSql); проскочи он — останется, а не ляжет в мешочек. */
       DELETE FROM yuplink.raid_hero_backpack h USING heroes x
        WHERE h.hero_id = x.hero_id AND h.stack_key NOT LIKE 'dmine:%'
       RETURNING h.*
     ),
     agg AS (
       SELECT g.stack_key, MIN(g.kind) AS kind, MIN(g.ref_id) AS ref_id, MIN(g.item_id) AS item_id,
              MIN(g.name) AS name, MIN(g.image) AS image, SUM(${put}) AS put, ${sums}
         FROM gone g
        GROUP BY g.stack_key
       HAVING SUM(${put}) > 0
     ),
     /* Надетые на проданных артефакты (§8.73 п. 4: «арты с героем никуда не уходят — всё
        выпадает на клетку») — тоже в мешочек: строка предмета уходит в снимок
        (raid_loot_bag_art), порция «art:<id>». Надетый уже на другого героя — остаётся. */
     eq AS (
       SELECT DISTINCT e.value AS item_id
         FROM ${PAWN_HERO_TAKE} p,
              jsonb_each_text(CASE WHEN jsonb_typeof(p.instance->'equipped') = 'object'
                                   THEN p.instance->'equipped' ELSE '{}'::jsonb END) e
        WHERE p.op IN (${ops}) AND p.instance->>'id' IN (SELECT hero_id FROM heroes)
          AND COALESCE(e.value, '') <> ''
     ),
     art_gone AS (
       DELETE FROM yuplink.user_game_item u USING eq
        WHERE u.id = eq.item_id AND u.account_id = ${sqlStr(o.account)} AND u.kind = 'artifact'
          AND NOT EXISTS (
            SELECT 1 FROM yuplink.hero_instance hi
             WHERE hi.account_id = u.account_id AND jsonb_typeof(hi.equipped) = 'object'
               AND EXISTS (SELECT 1 FROM jsonb_each_text(hi.equipped) x WHERE x.value = u.id))
       RETURNING u.*
     ),
     art_snap AS (
       INSERT INTO yuplink.raid_loot_bag_art (item_id, account_id, item)
       SELECT g.id, g.account_id, to_jsonb(g) FROM art_gone g
       RETURNING item_id
     ),
     arts AS (
       SELECT 'art:' || g.id AS stack_key, 'art'::text AS kind, g.template_id AS ref_id,
              g.id AS item_id, COALESCE(NULLIF(t.name, ''), 'Артефакт') AS name,
              t.image_url AS image, 1::numeric AS put
         FROM art_gone g JOIN yuplink.mystic_item_template t ON t.id = g.template_id
     ),
     fresh AS (
       INSERT INTO yuplink.raid_loot_bag
          (id, map_id, q, r, created_at, dropped_by, source, source_name, updated_at)
       SELECT ${newBagIdSql(o.key)}, ${sqlStr(o.mapId)}, ${q}, ${r}, now(), ${sqlStr(o.account)},
              'pawn', NULL, now()
        WHERE (EXISTS (SELECT 1 FROM agg) OR EXISTS (SELECT 1 FROM arts))
          AND NOT EXISTS (SELECT 1 FROM ex)
       /* Мешочек с этим id уже есть — доливаем в него: вещи не остаются без места. */
       ON CONFLICT (id) DO UPDATE SET updated_at = now()
       RETURNING id
     ),
     bag AS (
       SELECT id FROM ex WHERE EXISTS (SELECT 1 FROM agg) OR EXISTS (SELECT 1 FROM arts)
       UNION ALL SELECT id FROM fresh
     ),
     ins AS (
       INSERT INTO yuplink.raid_loot_bag_item AS it (${ITEM_COLS})
       SELECT bag.id, a.stack_key, ${PORTION_TTL}, a.kind, a.ref_id, a.item_id, a.name, a.image,
              a.put, ${ORIGINS.map((k) => `a.${k}`).join(", ")}
         FROM bag, agg a
       ON CONFLICT (bag_id, stack_key, expires_at) DO UPDATE
          SET count = it.count + EXCLUDED.count,
              ${ORIGINS.map((k) => `${k}_count = it.${k}_count + EXCLUDED.${k}_count`).join(", ")}
       RETURNING 1
     ),
     ins_art AS (
       INSERT INTO yuplink.raid_loot_bag_item (${ITEM_COLS})
       SELECT bag.id, a.stack_key, ${PORTION_TTL}, a.kind, a.ref_id, a.item_id, a.name, a.image,
              1, ${ORIGINS.map(() => "0").join(", ")}
         FROM bag, arts a
       RETURNING 1
     ),
     touch AS (
       UPDATE yuplink.raid_loot_bag SET updated_at = now()
        WHERE id IN (SELECT id FROM ex)
          AND (EXISTS (SELECT 1 FROM ins) OR EXISTS (SELECT 1 FROM ins_art))
       RETURNING 1
     )
     SELECT row_to_json(_t.*) AS _row FROM (
       SELECT a.stack_key, a.kind, a.ref_id, a.name, a.image, a.put,
              (SELECT id FROM bag LIMIT 1) AS bag_id,
              EXISTS (SELECT 1 FROM fresh) AS fresh
         FROM (SELECT stack_key, kind, ref_id, name, image, put FROM agg
               UNION ALL SELECT stack_key, kind, ref_id, name, image, put FROM arts) a
        WHERE EXISTS (SELECT 1 FROM bag)
        ORDER BY (a.kind = 'art') DESC, a.name, a.stack_key
     ) _t;`;
}
