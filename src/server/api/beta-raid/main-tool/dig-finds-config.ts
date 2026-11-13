// Настройка «Находки лопатой» (ПРАВИЛА §8.24 п. 6б): общий список долей и свои
// списки типов местности. Одна строка JSON в yuplink.settings (ключ dig_config),
// как настройка рыбалки: настройка мира, одна на всю игру. Доли нормализует
// сервер — что бы ни прислала форма, в настройке лежит сотня.
//
// Правит её админ из режима бога (окно клетки → «Местность» → «Находки»).
// Запись — одним оператором по частям JSON: правка одной местности не
// затирает соседнюю, сохранённую другим админом секундой раньше.
//
// Её читает каждое «Копать» — кэш процесса на полминуты; админ сохранил — кэш
// этого процесса сразу свежий, соседние процессы доживают свои 30 с.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import type { FishItem } from "@/lib/raid/fishChances";
import {
  DIG_FINDS_MAX,
  DIG_NONE,
  ITEM_RE,
  TERRAIN_RE,
  parseDigConfig,
  parseDigItems,
  type DigConfig,
} from "@/lib/raid/digFinds";
import { requireDesigner } from "@/server/api/beta-raid/island/island-editor-auth";
import { requireCatalogEditor } from "@/server/api/catalog-auth";

export const DIG_KEY = "dig_config";

const TTL_MS = 30_000;
let cache: { at: number; cfg: DigConfig } | null = null;

/** Настройка находок; строки нет — пустая (ничего не находят). */
export async function loadDigConfig(): Promise<DigConfig> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.cfg;
  const rows = (await mcpExec(
    `SELECT value FROM yuplink.settings WHERE key = ${sqlStr(DIG_KEY)} LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ value: unknown }>;
  const cfg = parseDigConfig(rows?.[0]?.value ?? null);
  cache = { at: Date.now(), cfg };
  return cfg;
}

/** Только для тестов: забыть кэш. */
export function dropDigConfigCache(): void {
  cache = null;
}

/** Окно админа: общий список и свой у местности (нет своего — null). */
export type DigFindsView = { common: FishItem[]; own: FishItem[] | null };

const view = (cfg: DigConfig, terrainId: string): DigFindsView => ({
  common: cfg.items,
  own: cfg.terrains[terrainId] ?? null,
});

const terrainIn = z.string().regex(TERRAIN_RE);

/** Админ: списки для местности клетки (свежие, мимо кэша). */
export const getDigFindsAdmin = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ terrainId: terrainIn }).parse(d))
  .handler(async ({ data }): Promise<DigFindsView> => {
    await requireDesigner();
    cache = null;
    return view(await loadDigConfig(), data.terrainId);
  });

/** Все товары списка — из справочника: удалённый или выдуманный id — отказ с ним. */
async function requireItems(items: readonly FishItem[]): Promise<void> {
  const ids = items.map((it) => it.id).filter((id) => id !== DIG_NONE);
  if (ids.length === 0) return;
  const rows = (await mcpExec(
    `SELECT id FROM yuplink.raid_custom_item WHERE id IN (${ids.map(sqlStr).join(", ")});`,
    { wrapJson: true },
  )) as Array<{ id: string }>;
  const have = new Set((rows ?? []).map((r) => String(r.id)));
  const miss = ids.filter((id) => !have.has(id));
  if (miss.length > 0) throw new Error(`Нет такого товара: ${miss.join(", ")}`);
}

/** Новое значение настройки из прежнего (base — jsonb) — выражение SQL. */
export function digSetExpr(base: string, scope: string | null, items: FishItem[] | null): string {
  const list = `${sqlStr(JSON.stringify(items ?? []))}::jsonb`;
  if (scope === null) return `jsonb_set(${base}, '{items}', ${list})`;
  const path = `ARRAY['terrains', ${sqlStr(scope)}]`;
  if (items === null) return `(${base} #- ${path})`;
  const withMap = `jsonb_set(${base}, '{terrains}', COALESCE(${base}->'terrains', '{}'::jsonb))`;
  return `jsonb_set(${withMap}, ${path}, ${list})`;
}

/**
 * Админ: сохранить список. terrainId — местность клетки (ответ — её вид);
 * forTerrain: true — свой список местности, false — общий. items: null при
 * своём — снять свой (местность снова копает по общему).
 */
export const saveDigFindsAdmin = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        terrainId: terrainIn,
        forTerrain: z.boolean(),
        items: z
          .array(
            z.object({
              id: z.union([z.literal(DIG_NONE), z.string().regex(ITEM_RE)]),
              pct: z.number().min(0).max(100),
            }),
          )
          .max(DIG_FINDS_MAX)
          .nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<DigFindsView> => {
    await requireCatalogEditor();
    const items = data.items === null ? null : parseDigItems(data.items);
    if (items) await requireItems(items);
    const scope = data.forTerrain ? data.terrainId : null;
    // Пустой общий — «ничего не находят»; пустой свой — то же, что снять свой.
    const next = scope !== null && items?.length === 0 ? null : items;
    const base = `COALESCE(NULLIF(yuplink.settings.value, '')::jsonb, '{}'::jsonb)`;
    const fresh = digSetExpr(`'{}'::jsonb`, scope, next);
    const rows = (await mcpExec(
      `INSERT INTO yuplink.settings (key, value)
       VALUES (${sqlStr(DIG_KEY)}, (${fresh})::text)
       ON CONFLICT (key) DO UPDATE SET value = (${digSetExpr(base, scope, next)})::text
       RETURNING value`,
      { wrapJsonCte: true },
    )) as Array<{ value: unknown }>;
    const cfg = parseDigConfig(rows?.[0]?.value ?? null);
    cache = { at: Date.now(), cfg };
    return view(cfg, data.terrainId);
  });
