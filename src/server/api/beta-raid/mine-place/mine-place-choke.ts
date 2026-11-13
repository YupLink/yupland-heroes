// Шахта не перекрывает проход (ПРАВИЛА §8.59 п. 8, владелец 20.10.2026): шахта —
// стена (п. 9), и поставленная в узкое место она замуровала бы портал, храм,
// тупик или другого игрока. Перед постановкой смотрим клетки в радиусе
// CHOKE_RADIUS вокруг цели: все проходимые соседи цели должны сообщаться друг с
// другом В ОБХОД неё. Не сообщаются в этом радиусе — отказ «перекроет проход»
// (длинный обход дальше радиуса не ищем: лучше отказать, чем отрезать).
//
// Стена здесь — местность без хода (нет её, вода, купол), преграда-декор, другая
// шахта и клетка срубленного дерева или горы, которые ещё вырастут: обход должен
// быть «откуда-то ещё» (владелец 20.10). Саму цель — место срубленного дерева —
// занять можно. Клетки с боссом или объектом стеной НЕ считаются (владелец 20.10:
// «не придумывай»), беглецы — тоже.
//
// Две постановки разом проверку проходят каждая по отдельности, а вместе
// замуровали бы. Поэтому вместе с клетками берём отпечаток шахт в радиусе, и
// постановка под локом карты сверяет его заново (mine-place-sql): появилась
// рядом новая шахта — отказ «попробуй ещё раз», повтор проверит уже с ней.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { decorBlocksSql, WATER_SQL } from "@/server/api/beta-raid/cell-sql";
import { mineCellSql } from "@/server/api/beta-raid/mine-cell-sql";

export const CHOKE_RADIUS = 8;

const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
];

const key = (q: number, r: number) => `${q},${r}`;

/**
 * Клетки (алиас c) в гекс-радиусе вокруг (q, r). Рамка BETWEEN — для индекса
 * клетки (map_id, q, r): без неё база листала карту (прод 21.10: 50 мс → 2 мс).
 */
const nearSql = (mapId: string, q: number, r: number, radius: number): string =>
  `c.map_id = ${sqlStr(mapId)}
      AND c.q BETWEEN ${q - radius} AND ${q + radius} AND c.r BETWEEN ${r - radius} AND ${r + radius}
      AND abs((c.q + c.r) - (${q + r})) <= ${radius}`;

/** Декор на клетке ещё вырастет и закроет её (дерево, гора и т. п.). */
const regrowSql = (c: string): string =>
  `EXISTS (SELECT 1 FROM yuplink.raid_decor_respawn d
            JOIN yuplink.mystic_item_template dt ON dt.id = d.decor_id
           WHERE d.map_id = ${c}.map_id AND d.q = ${c}.q AND d.r = ${c}.r
             AND d.placed_at IS NULL
             AND COALESCE(dt.meta->>'walkable', '') <> 'true')`;

/** Проходимые клетки вокруг цели. */
export const chokeCellsSql = (mapId: string, q: number, r: number, radius = CHOKE_RADIUS): string =>
  `SELECT c.q, c.r
     FROM yuplink.raid_map_cells c
     LEFT JOIN yuplink.mystic_item_template t ON t.id = c.terrain_id
    WHERE ${nearSql(mapId, q, r, radius)}
      AND c.terrain_id IS NOT NULL AND t.id IS NOT NULL
      AND NOT COALESCE(${WATER_SQL}, false)
      AND NOT COALESCE(c.void_fog, false)
      AND NOT ${decorBlocksSql("c")}
      AND NOT ${mineCellSql("c")}
      AND NOT ${regrowSql("c")}`;

/** Отпечаток шахт в радиусе: постановка под локом сверяет, что рядом не прибавилось. */
export const chokeMinesKeySql = (
  mapId: string,
  q: number,
  r: number,
  radius = CHOKE_RADIUS,
): string =>
  `(SELECT md5(COALESCE(string_agg(c.q || ',' || c.r, ';' ORDER BY c.q, c.r), ''))
      FROM yuplink.raid_map_cells c
     WHERE ${nearSql(mapId, q, r, radius)} AND ${mineCellSql("c")})`;

/**
 * Перекроет ли стена на (q, r) проход: true — соседи цели в обход неё не связаны
 * внутри набора `walk` (ключи «q,r» проходимых клеток). within — обход ищем не
 * дальше этого радиуса от цели: набор кандидатов режима стройки шире (радиус
 * героя + CHOKE_RADIUS), а судить каждого надо как саму постановку.
 */
export function blocksPath(
  walk: ReadonlySet<string>,
  q: number,
  r: number,
  within = Infinity,
): boolean {
  const target = key(q, r);
  const far = (cq: number, cr: number) =>
    (Math.abs(cq - q) + Math.abs(cr - r) + Math.abs(cq + cr - q - r)) / 2 > within;
  const near = DIRS.map(([dq, dr]) => key(q + dq, r + dr)).filter((k) => walk.has(k));
  if (near.length < 2) return false;
  const seen = new Set<string>([near[0]]);
  const stack = [near[0]];
  while (stack.length > 0) {
    const [cq, cr] = stack.pop()!.split(",").map(Number);
    for (const [dq, dr] of DIRS) {
      const k = key(cq + dq, cr + dr);
      if (k === target || seen.has(k) || !walk.has(k) || far(cq + dq, cr + dr)) continue;
      seen.add(k);
      stack.push(k);
    }
  }
  return near.some((k) => !seen.has(k));
}

/**
 * Отказ «перекроет проход», если шахта на (q, r) разорвёт соседние клетки.
 * Отдаёт отпечаток шахт в радиусе — его сверит постановка под локом карты.
 */
export async function requireNoChoke(mapId: string, q: number, r: number): Promise<string> {
  const rows = ((await mcpExec(
    `SELECT c.q, c.r, NULL::text AS k FROM (${chokeCellsSql(mapId, q, r)}) c
     UNION ALL SELECT NULL, NULL, ${chokeMinesKeySql(mapId, q, r)}`,
    { wrapJson: true },
  )) ?? []) as Array<{ q: number | string | null; r: number | string | null; k: string | null }>;
  const minesKey = rows.find((x) => x.k)?.k;
  if (!minesKey) throw new Error("mineplace.retry");
  const walk = new Set(
    rows.filter((x) => x.q !== null && x.r !== null).map((x) => key(Number(x.q), Number(x.r))),
  );
  if (blocksPath(walk, q, r)) throw new Error("mineplace.blocks_path");
  return minesKey;
}
