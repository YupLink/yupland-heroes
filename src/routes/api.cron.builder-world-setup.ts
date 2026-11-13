import { createFileRoute } from "@tanstack/react-router";
import { cronDenied } from "@/server/cronAuth";
import { BUILDER_WORLD_MAP_ID } from "@/lib/raid/builderWorld";

// Создать мир строителей (lib/landPlace) — один раз, повтор ничего не задваивает.
// Карта «Мир строителей» (размер 64 — только центр и старт; мир растёт куда
// угодно, до ±32000): портал в центре, вокруг шесть клеток травы, рядом лавка
// «Строительный рынок» (товары-земли выставляет админ). Этаж, настройка
// builder_world, вход — портал у ратуши Юпленда в Альфе (та же комната).
// Изменение Альфы уходит игрокам дельтой клетки. Защита — CRON_SECRET.
const MAP_ID = BUILDER_WORLD_MAP_ID;
const ALFA = "rmap_UthOURxc";
const GRASS = "terrain_QArF-OKH-s"; // «трава с холмами»
const PORTAL = "building_G4GD-gdM9S"; // «Портал»
const SHOP = "building_nzN3cRJ7Cy"; // «Строительный - Рынок»
const portalConfig = {
  portal: {
    group: 1,
    prices: [],
    levelTo: 100,
    levelFrom: 1,
    levelToOn: false,
    targetMap: MAP_ID,
    levelFromOn: false,
    moveEnergyMin: 0,
    moveEnergyMinOn: false,
  },
};
/** Вход в Альфе: свободная клетка у ратуши Юпленда (34,63), по порядку. */
const ENTRY_CANDIDATES: Array<[number, number]> = [
  [32, 64],
  [32, 65],
];

export const Route = createFileRoute("/api/cron/builder-world-setup")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = await cronDenied(request);
        if (denied) return denied;
        const { mcpExec } = await import("@/server/db/mcpClient");
        const { sqlStr } = await import("@/server/api/raid-shared");
        const { getCastlePosition } = await import("@/server/api/beta-raid/helpers");
        const { recordMapChange } = await import("@/server/api/beta-raid/map-journal");
        const { BUILDER_WORLD_KEY, dropBuilderWorldCache } =
          await import("@/server/api/beta-raid/land/builder-world");
        const cfg = sqlStr(JSON.stringify(portalConfig));
        const c = getCastlePosition(64);
        const ring: Array<[number, number]> = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
          [1, -1],
          [-1, 1],
        ];
        const land = ring.map(
          ([dq, dr]) =>
            `(${sqlStr(MAP_ID)}, ${c.q + dq}, ${c.r + dr}, ${sqlStr(GRASS)}, NULL, NULL)`,
        );
        const cells = [
          `(${sqlStr(MAP_ID)}, ${c.q}, ${c.r}, ${sqlStr(GRASS)}, ${sqlStr(PORTAL)}, ${cfg}::jsonb)`,
          ...land,
          `(${sqlStr(MAP_ID)}, ${c.q + 2}, ${c.r}, ${sqlStr(GRASS)}, ${sqlStr(SHOP)}, NULL)`,
        ];
        await mcpExec(
          `INSERT INTO yuplink.raid_maps (id, name, size, active, revision, created_at, updated_at)
           VALUES (${sqlStr(MAP_ID)}, 'Мир строителей', 64, true, 0, now(), now())
           ON CONFLICT (id) DO NOTHING;`,
          { wrapJson: false },
        );
        await mcpExec(
          `INSERT INTO yuplink.raid_map_cells (map_id, q, r, terrain_id, building_id, building_config)
           VALUES ${cells.join(",\n")}
           ON CONFLICT (map_id, q, r) DO NOTHING;`,
          { wrapJson: false },
        );
        await mcpExec(
          `INSERT INTO yuplink.raid_floor (map_id, num, name, created_by)
           SELECT ${sqlStr(MAP_ID)}, COALESCE((SELECT max(num) FROM yuplink.raid_floor), 0) + 1,
                  'Мир строителей', 'builder-world-setup'
            WHERE NOT EXISTS (SELECT 1 FROM yuplink.raid_floor WHERE map_id = ${sqlStr(MAP_ID)});`,
          { wrapJson: false },
        );
        await mcpExec(
          `INSERT INTO yuplink.settings (key, value)
           VALUES (${sqlStr(BUILDER_WORLD_KEY)}, ${sqlStr(JSON.stringify({ mapId: MAP_ID }))})
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;`,
          { wrapJson: false },
        );
        dropBuilderWorldCache();
        await recordMapChange(MAP_ID, { full: true }, undefined, { edit: true });

        // Вход в Альфе — если ещё не стоит: первая свободная клетка без игрока.
        const has = (await mcpExec(
          `SELECT q, r FROM yuplink.raid_map_cells
            WHERE map_id = ${sqlStr(ALFA)} AND building_id = ${sqlStr(PORTAL)}
              AND building_config->'portal'->>'targetMap' = ${sqlStr(MAP_ID)} LIMIT 1;`,
          { wrapJson: true },
        )) as Array<{ q: number; r: number }>;
        let entry: { q: number; r: number } | null = has?.[0] ?? null;
        for (const [q, r] of entry ? [] : ENTRY_CANDIDATES) {
          const set = (await mcpExec(
            `UPDATE yuplink.raid_map_cells c SET building_id = ${sqlStr(PORTAL)},
                    building_config = ${cfg}::jsonb, saved_at = now()
              WHERE c.map_id = ${sqlStr(ALFA)} AND c.q = ${q} AND c.r = ${r}
                AND c.building_id IS NULL AND c.object_id IS NULL AND c.decoration_id IS NULL
                AND c.road_id IS NULL AND NOT COALESCE(c.void_fog, false)
                AND NOT EXISTS (SELECT 1 FROM yuplink.beta_raid_positions p
                                 WHERE COALESCE(p.map_id, ${sqlStr(ALFA)}) = ${sqlStr(ALFA)}
                                   AND p.q = ${q} AND p.r = ${r})
             RETURNING c.q, c.r;`,
            { wrapJsonCte: true },
          )) as Array<{ q: number; r: number }>;
          if (set?.[0]) {
            entry = { q: Number(set[0].q), r: Number(set[0].r) };
            await recordMapChange(
              ALFA,
              {
                patches: [
                  { q: entry.q, r: entry.r, buildingId: PORTAL, buildingConfig: portalConfig },
                ],
              },
              undefined,
              { edit: true },
            );
            break;
          }
        }
        return Response.json({ ok: true, mapId: MAP_ID, center: c, entry });
      },
    },
  },
});
