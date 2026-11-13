// SQL «Закопать» пустую ямку (владелец, 31.10.2026; ПРАВИЛА §8.24 п. 6б):
// «копать ещё раз ямку нельзя — будет возможность только закопать её —
// образовывается кучка — кучка живёт уже по своему». Кучка — бугорок: мешочек,
// закопанный сразу, с одной порцией-меткой DIG_EMPTY_KEY (не товар). Живёт как
// бугорок (порция — 24 ч), «Выкопать» её снимает (bag-dig-sql): пусто, ямка.
//
// Одним оператором под локом клетки: на клетке ямка (час), нет мешочка с живой
// порцией (в ямке находка — закапывают её саму, §8.21) и сундука. Двое разом —
// кучка одна. Ключ нажатия — в raid_loot_bag_op (kind 'hbury', id мешочка — от
// ключа) в обоих исходах; повтор отвечает прежним исходом.
// Комментарии внутри SQL — только блочные.
import { sqlStr } from "@/server/api/raid-shared";
import { DIG_EMPTY_KEY, DIG_HOLE_MINUTES } from "@/lib/digHole";
import { PORTION_TTL, livePortion } from "@/server/api/beta-raid/loot-bag/bag-sql";
import { ORIGINS } from "@/server/api/beta-raid/stack-origin";

type HoleAt = { mapId: string; q: number; r: number; op: string; account: string };

const cellLockSql = (o: HoleAt): string =>
  `SELECT pg_advisory_xact_lock(hashtext(${sqlStr(
    `hbury:${o.mapId}:${Math.floor(o.q)}:${Math.floor(o.r)}`,
  )})) AS l;`;

const at = (a: string, o: HoleAt): string =>
  `${a}.map_id = ${sqlStr(o.mapId)} AND ${a}.q = ${Math.floor(o.q)} AND ${a}.r = ${Math.floor(o.r)}`;

/** id кучки — от ключа нажатия, выражением базы (как у мешочков). */
const bagId = (op: string): string => `'lb_' || md5(${sqlStr(op)})`;

/** Ответ: исход ключа и наш ли он (nonce вызова — как у «Копать»). */
export type HoleBuryRow = { state: "done" | "failed" | null; mine?: boolean | null };

export function holeBurySql(o: HoleAt & { nonce: string }): string {
  const [op, acc, nonce] = [sqlStr(o.op), sqlStr(o.account), sqlStr(o.nonce)];
  const zeros = ORIGINS.map(() => "0").join(", ");
  return `${cellLockSql(o)}
     WITH prior AS (
       SELECT state, parts->>'nonce' AS nonce FROM yuplink.raid_loot_bag_op WHERE op = ${op}
     ),
     ok AS (
       SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM prior)
          AND EXISTS (SELECT 1 FROM yuplink.raid_dig_hole h
                       WHERE ${at("h", o)} AND h.dug_at > now() - interval '${DIG_HOLE_MINUTES} minutes')
          AND NOT EXISTS (SELECT 1 FROM yuplink.raid_loot_bag b
                           WHERE ${at("b", o)}
                             AND EXISTS (SELECT 1 FROM yuplink.raid_loot_bag_item x
                                          WHERE x.bag_id = b.id AND ${livePortion("x")}))
          AND NOT EXISTS (SELECT 1 FROM yuplink.raid_plain_chest pc WHERE ${at("pc", o)})
          AND NOT EXISTS (SELECT 1 FROM yuplink.raid_magic_chest mc WHERE ${at("mc", o)})
     ),
     bag AS (
       INSERT INTO yuplink.raid_loot_bag
              (id, map_id, q, r, created_at, dropped_by, source, source_name, updated_at,
               buried_at, buried_by)
       SELECT ${bagId(o.op)}, ${sqlStr(o.mapId)}, ${Math.floor(o.q)}, ${Math.floor(o.r)}, now(),
              ${acc}, 'dig', 'Лопата', now(), now(), ${acc}
         FROM ok
       ON CONFLICT (id) DO NOTHING
       RETURNING id
     ),
     item AS (
       INSERT INTO yuplink.raid_loot_bag_item
              (bag_id, stack_key, expires_at, kind, ref_id, item_id, name, image, count,
               ${ORIGINS.map((k) => `${k}_count`).join(", ")})
       SELECT bag.id, ${sqlStr(DIG_EMPTY_KEY)}, ${PORTION_TTL}, 'empty', NULL, NULL, '', NULL, 1, ${zeros}
         FROM bag
       RETURNING 1
     ),
     mark AS (
       INSERT INTO yuplink.raid_loot_bag_op (op, bag_id, account_id, kind, state, parts)
       SELECT ${op}, ${bagId(o.op)}, ${acc}, 'hbury',
              CASE WHEN EXISTS (SELECT 1 FROM bag) THEN 'done' ELSE 'failed' END,
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
 * «Забор», когда ответ holeBurySql не пришёл: под тем же локом клетки — ключ
 * с исходом 'failed', если его ещё нет. Ответ — исход ключа и nonce записавшего.
 */
export function holeBuryFenceSql(o: HoleAt): string {
  const op = sqlStr(o.op);
  return `${cellLockSql(o)}
     INSERT INTO yuplink.raid_loot_bag_op (op, bag_id, account_id, kind, state)
     VALUES (${op}, ${bagId(o.op)}, ${sqlStr(o.account)}, 'hbury', 'failed')
     ON CONFLICT (op) DO NOTHING;
     SELECT row_to_json(_t.*) AS _row FROM (
       SELECT state, parts->>'nonce' AS nonce FROM yuplink.raid_loot_bag_op WHERE op = ${op}
     ) _t;`;
}
