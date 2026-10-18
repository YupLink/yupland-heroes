// Генератор миров — ручки админки (/admin/worldgen): список миров, «Создать»
// (карта-черновик по логике живой карты) и «Дорастить» бесконечный мир.
//
// Образец — живая карта (settings.beta_raid_map): «логика как у Альфы». Новая
// карта — черновик: активной её делают только руками, живую карту генератор
// не трогает. Тяжёлые модули — динамическим импортом: файл с ручками тянет
// страница админки, и генератору в её бандле делать нечего.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/server/auth";
import { mcpExec } from "@/server/db/mcpClient";

export type WorldRow = {
  mapId: string;
  name: string;
  seed: number;
  endless: boolean;
  size: number;
  chunks: number;
  halls: number;
  createdAt: string;
};

export const adminWorldList = createServerFn({ method: "GET" }).handler(
  async (): Promise<WorldRow[]> => {
    requireAdmin();
    const rows = (await mcpExec(
      `SELECT w.map_id AS "mapId", m.name, w.seed, w.endless, m.size, w.created_at AS "createdAt",
              (SELECT count(*) FROM yuplink.raid_world_chunk c WHERE c.map_id = w.map_id)::int AS chunks,
              (SELECT count(*) FROM yuplink.raid_town t WHERE t.map_id = w.map_id)::int AS halls
         FROM yuplink.raid_world w JOIN yuplink.raid_maps m ON m.id = w.map_id
        ORDER BY w.created_at DESC LIMIT 50;`,
      { wrapJson: true },
    )) as Array<Record<string, unknown>>;
    return (rows ?? []).map((r) => ({
      mapId: String(r.mapId),
      name: String(r.name ?? ""),
      seed: Number(r.seed) || 0,
      endless: r.endless === true || r.endless === "t",
      size: Number(r.size) || 0,
      chunks: Number(r.chunks) || 0,
      halls: Number(r.halls) || 0,
      createdAt: String(r.createdAt ?? ""),
    }));
  },
);

const createInput = z.object({
  name: z.string().trim().min(1).max(80),
  /** Сид числом или фразой («Северный архипелаг»); пусто — случайный. */
  seedText: z.string().max(80),
  kind: z.enum(["map", "endless"]),
  size: z.union([z.literal(128), z.literal(256)]),
  /** Суша, %; null — как в исходном квадрате живой карты. */
  landPct: z.number().int().min(5).max(100).nullable(),
  /** Земли мира (выбор админа); нет или пусто — все земли образца. */
  lands: z.array(z.string().min(1).max(64)).max(64).nullable().optional(),
});

export type WorldTerrain = { id: string; name: string; image: string | null; share: number };

/**
 * Земли, из которых можно собрать мир: земли образца (живой карты) с их долей
 * в исходном квадрате — тот же отбор, что у сборки мира (learn.landCandidates).
 */
export const adminWorldTerrains = createServerFn({ method: "GET" }).handler(
  async (): Promise<WorldTerrain[]> => {
    requireAdmin();
    const [{ activeBetaMapId }, { landCandidates }, sql, { sqlStr }] = await Promise.all([
      import("@/server/api/beta-raid/encounter-where"),
      import("./learn"),
      import("./learn-sql"),
      import("@/server/api/raid-shared"),
    ]);
    const mapId = await activeBetaMapId();
    const q = async (s: string) =>
      ((await mcpExec(s, { wrapJson: true })) ?? []) as Array<Record<string, unknown>>;
    const size =
      Number(
        (await q(`SELECT size FROM yuplink.raid_maps WHERE id = ${sqlStr(mapId)};`))[0]?.size,
      ) || 128;
    const [list, stats, core] = await Promise.all([
      q(sql.terrainListSql()),
      q(sql.terrainStatsSql(mapId)),
      q(sql.coreSharesSql(mapId, size)),
    ]);
    const str = (v: unknown) => String(v ?? "");
    const num = (v: unknown) => Number(v) || 0;
    const terrains = list.map((r) => ({ id: str(r.id), name: str(r.name) }));
    const cands = landCandidates({
      terrains,
      stats: stats.map((r) => ({
        id: str(r.id),
        n: num(r.n),
        bld: num(r.bld),
        road: num(r.road),
        free: num(r.free),
        obj: num(r.obj),
      })),
      core: core.map((r) => ({ id: str(r.id), n: num(r.n) })),
    });
    const n = new Map(core.map((r) => [str(r.id), num(r.n)]));
    const total = cands.reduce((s, c) => s + (n.get(c.id) ?? 0), 0) || 1;
    const meta = new Map(list.map((r) => [str(r.id), r]));
    return cands
      .map((c) => ({
        id: c.id,
        name: str(meta.get(c.id)?.name),
        image: (meta.get(c.id)?.image as string | null | undefined) ?? null,
        share: Math.round(((n.get(c.id) ?? 0) / total) * 1000) / 10,
      }))
      .sort((a, b) => b.share - a.share || (a.name < b.name ? -1 : 1));
  },
);

export const adminWorldCreate = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => createInput.parse(d))
  .handler(async ({ data }) => {
    const by = requireAdmin();
    const [{ parseSeedInput }, { newSeed }, { activeBetaMapId }, { createWorld }] =
      await Promise.all([
        import("@/lib/raid/zonegen/seed"),
        import("@/lib/raid/zonegen/recipe"),
        import("@/server/api/beta-raid/encounter-where"),
        import("./create"),
      ]);
    const parsed = parseSeedInput(data.seedText);
    const seed = data.seedText.trim() === "" ? newSeed() : parsed.seed;
    return createWorld({
      name: data.name,
      seed,
      kind: data.kind,
      size: data.size,
      landPct: data.landPct,
      lands: data.lands ?? null,
      sourceMapId: await activeBetaMapId(),
      by,
    });
  });

export const adminWorldGrow = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ mapId: z.string().min(1).max(64) }).parse(d))
  .handler(async ({ data }) => {
    requireAdmin();
    const { growWorld } = await import("./create");
    return growWorld(data.mapId);
  });
