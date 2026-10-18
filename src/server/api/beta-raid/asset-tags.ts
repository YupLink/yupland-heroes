// Метки ассетов карты на сервере: чтение (генераторы, админка) и галочки админа.
//
// Хранятся в yuplink.raid_asset_tags (migrations/tags-01): ключ — id шаблона
// декора/постройки или id облика. Пусто = «подходит всем» (lib/raid/assetTags).
// Автоматическая разметка живёт в asset-tags-auto.ts.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "../../db/mcpClient";
import { getCurrentWallet, isAdminWallet } from "../../auth";
import { sqlStr } from "../raid-shared";
import { cleanList, type AssetTagKind, type AssetTags } from "@/lib/raid/assetTags";
import { RACES } from "@/components/heroMeta";

/** Метки меняются галочками админа — минуты кэша генератору хватает. */
const TTL_MS = 60_000;
let cache: { expires: number; value: Map<string, AssetTags> } | null = null;

type Row = { ref_id: string; terrains: unknown; races: unknown; auto: boolean };

/** Массив строк для SQL: text[] без пустышек. */
export const sqlTextArray = (list: readonly string[]): string =>
  list.length === 0 ? `'{}'::text[]` : `ARRAY[${list.map(sqlStr).join(",")}]::text[]`;

/** Все метки: id → местности/расы. Нет таблицы (свежая база) — пусто, без меток. */
export async function loadAssetTags(): Promise<Map<string, AssetTags>> {
  if (cache && cache.expires > Date.now()) return cache.value;
  const rows = ((await mcpExec(
    `SELECT ref_id, terrains, races, auto FROM yuplink.raid_asset_tags;`,
    { wrapJson: true },
  ).catch(() => [])) ?? []) as Row[];
  const value = new Map<string, AssetTags>();
  for (const r of rows) {
    value.set(String(r.ref_id), {
      terrains: cleanList(r.terrains),
      races: cleanList(r.races),
      auto: r.auto !== false,
    });
  }
  cache = { expires: Date.now() + TTL_MS, value };
  return value;
}

/**
 * Метки местности у ЖИВОГО декора — генератору зон: удалённый шаблон с меткой
 * не должен всплыть в свежей зоне. Декор без меток в словарь не попадает.
 */
export async function loadDecorTerrains(): Promise<Record<string, string[]>> {
  const [tags, { loadDecorCatalog }] = await Promise.all([
    loadAssetTags(),
    import("./zonegen/catalog"),
  ]);
  const out: Record<string, string[]> = {};
  for (const d of await loadDecorCatalog()) {
    const terrains = tags.get(d.id)?.terrains ?? [];
    if (terrains.length > 0) out[d.id] = terrains;
  }
  return out;
}

/** Галочки поменялись — генераторы должны увидеть их сразу. */
export async function dropAssetTagsCaches(): Promise<void> {
  cache = null;
  const [{ dropAffinityCache }, { dropBuildingCatalogCache }] = await Promise.all([
    import("./zonegen/affinity"),
    import("./zonegen/catalog-buildings"),
  ]);
  dropAffinityCache();
  dropBuildingCatalogCache();
}

function requireAdmin(): void {
  const w = getCurrentWallet();
  if (!w || !isAdminWallet(w)) throw new Error("Только админ размечает ассеты");
}

/** Метки нужных id + список местностей для галочек. */
export const adminGetAssetTags = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z.object({ ids: z.array(z.string().min(1).max(80)).max(50) }).parse(d),
  )
  .handler(async ({ data }) => {
    requireAdmin();
    // Автоматика догоняет новые ассеты сама — не чаще раза в 10 минут.
    const { autoTagAssetsIfStale } = await import("./asset-tags-auto");
    await autoTagAssetsIfStale().catch(() => {});
    const [all, { loadTerrainCatalog }] = await Promise.all([
      loadAssetTags(),
      import("./zonegen/catalog"),
    ]);
    const tags: Record<string, AssetTags> = {};
    for (const id of data.ids) {
      const t = all.get(id);
      if (t) tags[id] = t;
    }
    return { tags, terrains: await loadTerrainCatalog(), races: [...RACES] as string[] };
  });

/** Галочки админа: строка становится ручной (auto = false), автоматика её не трогает. */
export const adminSetAssetTags = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        refId: z.string().min(1).max(80),
        kind: z.enum(["decoration", "building", "skin"]),
        terrains: z.array(z.string().min(1).max(80)).max(200),
        races: z.array(z.enum(RACES)).max(RACES.length),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    requireAdmin();
    const kind: AssetTagKind = data.kind;
    const terrains = cleanList(data.terrains);
    const races = cleanList(data.races);
    await mcpExec(
      `INSERT INTO yuplink.raid_asset_tags (ref_id, kind, terrains, races, auto, updated_at)
       VALUES (${sqlStr(data.refId)}, ${sqlStr(kind)}, ${sqlTextArray(terrains)},
               ${sqlTextArray(races)}, false, now())
       ON CONFLICT (ref_id) DO UPDATE
         SET kind = EXCLUDED.kind, terrains = EXCLUDED.terrains, races = EXCLUDED.races,
             auto = false, updated_at = now();`,
    );
    await dropAssetTagsCaches();
    return { ok: true as const, tags: { terrains, races, auto: false } };
  });
