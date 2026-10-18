// Разведанное аккаунта «островами»: строка r, первая q и длина подряд идущих
// клеток.
//
// Туман войны лежит строками «q,r» (beta_raid_fog_seen, см. fog.ts) — у
// первопроходца их сотня тысяч, и списком это 760 КБ текста. Острова считает
// сама база (окно по строке: q минус номер по порядку постоянен внутри
// острова), и та же сотня тысяч клеток едет полутора тысячами троек — 16 КБ.
// Замер 04.10.2026 (EXPLAIN ANALYZE): 168 мс в базе на 101 825 клеток, у
// медианного игрока (7 033 клетки) — 532 острова, 4,7 КБ.
//
// Ключи кривого вида отсекаются до разбора: каст в int упал бы на всём запросе.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";

export async function loadSeenIslands(owner: string, mapId: string): Promise<string> {
  const rows = (await mcpExec(
    `SELECT string_agg(r || ',' || q0 || ',' || n, ';') AS s FROM (
       SELECT r, min(q) AS q0, count(*) AS n FROM (
         SELECT q, r, q - row_number() OVER (PARTITION BY r ORDER BY q) AS g FROM (
           SELECT DISTINCT split_part(cell, ',', 1)::int AS q, split_part(cell, ',', 2)::int AS r
             FROM yuplink.beta_raid_fog_seen
            WHERE owner = ${sqlStr(owner)} AND map_id = ${sqlStr(mapId)}
              AND cell ~ '^-?[0-9]{1,6},-?[0-9]{1,6}$'
         ) p
       ) w
       GROUP BY r, g
     ) i;`,
    { wrapJson: true },
  )) as Array<{ s: string | null }>;
  return String(rows?.[0]?.s ?? "");
}
