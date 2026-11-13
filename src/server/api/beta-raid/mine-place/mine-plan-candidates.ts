// Кандидаты режима стройки (ПРАВИЛА §8.59 п. 8): можно ли поставить шахту на
// каждую из 19 клеток в радиусе MINE_BUILD_RADIUS вокруг героя — зелёная или
// красная клетка и почему. Те же правила, что у самой постановки, тем же кодом:
//  · признаки клетки — столбцы оператора постановки (chest-cell, mine-place-cell,
//    mine-place-need) одним запросом на все клетки сразу;
//  · отказ — cellVerdict (тот же, что у placeVerdict);
//  · проход не проверяем (владелец, 22.10.2026: «если шахта преградит путь —
//    то и пусть»), как и сама постановка.
// Зелёная клетка — не обещание: постановка ещё раз проверит всё под локами.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import {
  CELL_HELD,
  cellExtraColsSql,
  cellFlagsColsSql,
  sameCellAsC,
} from "@/server/api/beta-raid/chest/chest-cell";
import { mineCellColsSql } from "@/server/api/beta-raid/mine-place/mine-place-cell-sql";
import { needColsSql } from "@/server/api/beta-raid/mine-place/mine-place-need-sql";
import { cellVerdict } from "@/server/api/beta-raid/mine-place/mine-place-verdict";
import type { PlaceMineRow } from "@/server/api/beta-raid/mine-place/mine-place-sql";
import { MINE_BUILD_RADIUS, type PlaceableBlueprint } from "@/lib/minePlacement";
import { hexDisk, type MineCandidate } from "@/lib/mineBuild";

/** Строка кандидата: клетка и признаки, как у оператора постановки. */
export type CandidateRow = Pick<
  PlaceMineRow,
  "busy" | "road" | "taken" | "bag" | "player" | "trees" | "mountains" | "vein"
> & { q: number | string; r: number | string };

type At = { mapId: string; q: number; r: number };

/** Признаки всех клеток в радиусе вокруг героя — один запрос. */
export function candidatesSql(
  o: At & { account: string; kind: PlaceableBlueprint },
  radius = MINE_BUILD_RADIUS,
): string {
  const [q, r] = [Math.floor(o.q), Math.floor(o.r)];
  const need = needColsSql(o.kind);
  return `SELECT f.q, f.r, ${CELL_HELD} AS busy, f.road, f.taken, f.bag, f.player,
            f.trees, f.mountains, f.vein
       FROM (
         SELECT c.q, c.r, ${cellFlagsColsSql(sameCellAsC)},
                ${cellExtraColsSql(sameCellAsC)},
                ${mineCellColsSql(o.account, sameCellAsC)},
                ${need.trees} AS trees, ${need.mountains} AS mountains, ${need.vein} AS vein
           FROM yuplink.raid_map_cells c
           LEFT JOIN yuplink.mystic_item_template t ON t.id = c.terrain_id
           ${need.join}
          WHERE c.map_id = ${sqlStr(o.mapId)}
            AND c.q BETWEEN ${q - radius} AND ${q + radius}
            AND c.r BETWEEN ${r - radius} AND ${r + radius}
            AND abs((c.q + c.r) - ${q + r}) <= ${radius}
       ) f
       CROSS JOIN LATERAL (SELECT f.decor, f.ship) ex`;
}

/** Зелёные и красные клетки по ответам базы. Клетки нет в ответе — её нет на карте. */
export function candidateVerdicts(
  center: { q: number; r: number },
  kind: PlaceableBlueprint,
  rows: readonly CandidateRow[],
  radius = MINE_BUILD_RADIUS,
): MineCandidate[] {
  const byKey = new Map(rows.map((x) => [`${Number(x.q)},${Number(x.r)}`, x]));
  return hexDisk(center, radius).map(({ q, r }) => {
    const row = byKey.get(`${q},${r}`);
    const bad = cellVerdict(row ? { ...row, cell: true } : null, kind);
    return { q, r, ok: bad === null, reason: bad };
  });
}

/** Кандидаты вокруг клетки героя: один запрос признаков, вердикт — в JS. */
export async function mineCandidates(
  o: At & { account: string; kind: PlaceableBlueprint },
): Promise<MineCandidate[]> {
  const rows = (await mcpExec(candidatesSql(o), { wrapJson: true })) as CandidateRow[] | null;
  return candidateVerdicts(o, o.kind, rows ?? []);
}
