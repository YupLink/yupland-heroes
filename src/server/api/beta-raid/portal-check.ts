// Сверка порталов (владелец, 30.10.2026: страница «только на чтение» для
// Ангелины): по каждому открытому миру — сколько порталов и почему какие-то не
// межмировые, межмировые входы с мирами назначения и сколько игроков видят
// каждый вход. Правило то же, что у карт игрока и прохода (portal-classify),
// «видит» — как у getWorldPortals: разведана любая клетка постройки входа.
//
// Только чтение и только счёт: ни id игроков, ни их позиций в ответе нет.
// Пускает редактор замка (requireCastleEditor: админы + Ангелина).
//
// Тяжёлые серверные модули — динамическим импортом: файл импортирует страница.
import { createServerFn } from "@tanstack/react-start";
import { requireCastleEditor } from "@/server/auth";
import type { PortalCheckEntry, PortalCheckWire, PortalCheckWorld } from "@/lib/raid/portalCheck";

export const getPortalCheck = createServerFn({ method: "GET" }).handler(
  async (): Promise<PortalCheckWire> => {
    await requireCastleEditor();
    const { loadPortalNet, blockCells, PORTAL_SQL } = await import("./world-portals-net");
    const { classifyPortals } = await import("./portal-classify");
    const { isVoidFlag } = await import("./packCells");
    const { activeBetaMapId } = await import("./encounter-where");
    const { mcpExec } = await import("@/server/db/mcpClient");

    const [{ rows, names }, main] = await Promise.all([loadPortalNet(), activeBetaMapId()]);
    const verdicts = classifyPortals(rows, new Set(names.keys()));
    const worlds = new Map<string, PortalCheckWorld>();
    for (const [id, name] of names) {
      worlds.set(id, { name, total: 0, doors: 0, closed: 0, alone: 0, inner: 0, cross: [] });
    }
    const entries: Array<{ mapId: string; cells: string[]; entry: PortalCheckEntry }> = [];
    rows.forEach((row, i) => {
      const w = worlds.get(row.map_id);
      if (!w) return;
      const v = verdicts[i];
      w.total++;
      if (v.kind === "door") w.doors++;
      else if (v.kind === "closed") w.closed++;
      else if (v.kind === "alone") w.alone++;
      else if (v.kind === "inner") w.inner++;
      else {
        const q = Number(row.q);
        const r = Number(row.r);
        const cells = blockCells(row);
        const entry: PortalCheckEntry = {
          q,
          r,
          others: cells.filter(([cq, cr]) => cq !== q || cr !== r),
          to: v.to.map((m) => names.get(m) ?? m),
          alsoHere: v.alsoHere,
          void: isVoidFlag(row.void_fog),
          onMap: 0,
          seenBy: 0,
        };
        w.cross.push(entry);
        entries.push({ mapId: row.map_id, cells: cells.map(([cq, cr]) => `${cq},${cr}`), entry });
      }
    });
    for (const w of worlds.values()) w.cross.sort((a, b) => a.r - b.r || a.q - b.q);

    const [counts, islands] = await Promise.all([
      entries.length ? seenCounts(mcpExec, entries, main) : Promise.resolve([]),
      mcpExec(
        `SELECT count(DISTINCT c.map_id)::int AS n
           FROM yuplink.raid_map_cells c
           JOIN yuplink.mystic_item_template t ON t.id = c.building_id
          WHERE c.map_id LIKE 'isle\\_%' AND ${PORTAL_SQL};`,
        { wrapJson: true },
      ) as Promise<Array<{ n: number }>>,
    ]);
    for (const c of counts) {
      const e = entries[Number(c.k)]?.entry;
      if (!e) continue;
      e.onMap = Number(c.on_map) || 0;
      e.seenBy = Number(c.seen_by) || 0;
    }
    return {
      worlds: [...worlds.values()],
      islands: { count: Number(islands?.[0]?.n) || 0, to: names.get(main) ?? main },
    };
  },
);

type Run = (sql: string, o: { wrapJson: boolean }) => Promise<unknown>;

/**
 * Сколько игроков стоят в мире входа и сколько из них разведали хоть одну его
 * клетку. Позиция без карты — главный мир (как POS_MAP_SQL).
 */
async function seenCounts(
  run: Run,
  entries: Array<{ mapId: string; cells: string[] }>,
  main: string,
): Promise<Array<{ k: number; on_map: number; seen_by: number }>> {
  const { sqlStr } = await import("@/server/api/raid-shared");
  const values = entries
    .map(
      (e, k) =>
        `(${k}, ${sqlStr(e.mapId)}, ARRAY[${e.cells.map((c) => sqlStr(c)).join(", ")}]::text[])`,
    )
    .join(", ");
  return (await run(
    `WITH e(k, map_id, cells) AS (VALUES ${values}),
          pl AS (SELECT account_id, COALESCE(map_id, ${sqlStr(main)}) AS map_id
                   FROM yuplink.beta_raid_positions)
     SELECT e.k, count(pl.account_id)::int AS on_map,
            (count(pl.account_id) FILTER (WHERE EXISTS (
               SELECT 1 FROM yuplink.beta_raid_fog_seen f
                WHERE f.owner = pl.account_id AND f.map_id = e.map_id
                  AND f.cell = ANY (e.cells))))::int AS seen_by
       FROM e LEFT JOIN pl ON pl.map_id = e.map_id
      GROUP BY e.k;`,
    { wrapJson: true },
  )) as Array<{ k: number; on_map: number; seen_by: number }>;
}
