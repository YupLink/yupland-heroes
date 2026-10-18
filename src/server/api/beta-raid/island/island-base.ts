// Образец для острова: спецификация мира из генератора миров (земли, декор,
// наборы городов) и справочник построек для города. Снимать спецификацию с
// живой карты заново на каждый остров — пятнадцать тяжёлых SELECT; берём уже
// снятую у мира v4 с наборами городов и держим в памяти.
import { mcpExec } from "@/server/db/mcpClient";
import { swrCache } from "@/server/cache/swr";
import { worldSpecSchema, type WorldSpec } from "@/lib/raid/worldgen/spec";
import type { TownCatalog } from "@/lib/raid/worldgen/town";
import { catalogOf } from "../worldgen/create";
import type { Query } from "../worldgen/learn-load";

export type IslandBase = { spec: WorldSpec; catalog: TownCatalog };

const BASE_TTL_MS = 10 * 60_000;

const query: Query = async (sql) => ((await mcpExec(sql, { wrapJson: true })) ?? []) as unknown[];

async function loadBase(): Promise<IslandBase> {
  // Мир со всеми землями образца (у «Планеты воды» — одни пустыни), затем — с
  // наибольшим числом наборов городов: у него есть города всех рас.
  const rows = (await mcpExec(
    `SELECT spec FROM yuplink.raid_world
      WHERE spec->>'v' = '4'
      ORDER BY jsonb_array_length(COALESCE(spec->'land', '[]'::jsonb)) DESC,
               jsonb_array_length(COALESCE(spec->'towns'->'kits', '[]'::jsonb)) DESC,
               created_at DESC
      LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ spec: unknown }>;
  const raw = rows?.[0]?.spec;
  if (!raw) throw new Error("island.no_world");
  const spec = worldSpecSchema.parse(typeof raw === "string" ? JSON.parse(raw) : raw);
  const { activeBetaMapId } = await import("../encounter-where");
  const catalog = await catalogOf(query, await activeBetaMapId(), spec.towns.kits);
  return { spec, catalog };
}

const cache = swrCache<IslandBase>({ ttl: BASE_TTL_MS, load: loadBase });

export const islandBase = (): Promise<IslandBase> => cache.get("base");
