// Внутрянка замка: отдельный редактор интерьера — СВОИ таблицы, без пересечений
// с общей картой рейда.
//
// Слои клетки: местность (подложка) + постройка + объект + декор + дорога.
// Ассеты всех слоёв живут в ОДНОМ каталоге castle_terrain_template с колонкой
// kind (исторически имя таблицы — «местность», но с kind это общий каталог
// замка: заводить отдельную таблицу под каждый слой — плодить CRUD впятеро).
//
// Объединение клеток: cells.group_id. Клетки с одним group_id — ОДНА большая
// клетка: слои у них одинаковые, а картинка постройки рисуется один раз на весь
// блок (дизайнер ставит здание на 2–10 клеток, масштаб картинки блока — icon_scale).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "../db/mcpClient";
import { requireCastleEditor, requireWallet } from "../auth";
import { sqlStr } from "./raid-shared";
import {
  EMPTY_CASTLE_CELL as EMPTY,
  castleCellHasContent as hasContent,
  type CastleCell,
} from "@/lib/castleKinds";
import { ICON_SCALE_MAX, ICON_SCALE_MIN, clampIconScale } from "@/lib/mergeScale";

import { LABEL_SIZE_DEFAULT } from "@/lib/castleLabelSize";

export const CASTLE_INTERIOR_MAP_ID = "castle_interior";

/** Идемпотентная подготовка таблиц + дорастание колонок. Кэш на процесс. */
let tablesReady: Promise<void> | null = null;
export function ensureCastleTables(): Promise<void> {
  if (tablesReady) return tablesReady;
  tablesReady = (async () => {
    await mcpExec(
      `CREATE TABLE IF NOT EXISTS yuplink.castle_terrain_template (
         id                text PRIMARY KEY,
         name              text NOT NULL,
         image_url         text NOT NULL,
         active            boolean NOT NULL DEFAULT true,
         created_at        timestamptz NOT NULL DEFAULT now(),
         created_by_wallet text
       );
       ALTER TABLE yuplink.castle_terrain_template
         ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'terrain',
         ADD COLUMN IF NOT EXISTS menu_action text,
         ADD COLUMN IF NOT EXISTS label_font_size integer NOT NULL DEFAULT ${LABEL_SIZE_DEFAULT};
       CREATE TABLE IF NOT EXISTS yuplink.castle_map_cells (
         map_id     text NOT NULL,
         q          int  NOT NULL,
         r          int  NOT NULL,
         terrain_id text REFERENCES yuplink.castle_terrain_template(id) ON DELETE SET NULL,
         PRIMARY KEY (map_id, q, r)
       );
       ALTER TABLE yuplink.castle_map_cells
         ADD COLUMN IF NOT EXISTS building_id   text REFERENCES yuplink.castle_terrain_template(id) ON DELETE SET NULL,
         ADD COLUMN IF NOT EXISTS object_id     text REFERENCES yuplink.castle_terrain_template(id) ON DELETE SET NULL,
         ADD COLUMN IF NOT EXISTS decoration_id text REFERENCES yuplink.castle_terrain_template(id) ON DELETE SET NULL,
         ADD COLUMN IF NOT EXISTS road_id       text REFERENCES yuplink.castle_terrain_template(id) ON DELETE SET NULL,
         ADD COLUMN IF NOT EXISTS group_id      text,
         ADD COLUMN IF NOT EXISTS icon_scale    numeric;`,
    ).catch((e: unknown) => {
      // Не запомним провал — следующий заход попробует снова. Но и молчать
      // нельзя: без колонок load/save упали бы позже с невнятной ошибкой.
      tablesReady = null;
      console.warn("[castle-editor] подготовка таблиц не удалась:", (e as Error)?.message ?? e);
      throw e;
    });
  })();
  return tablesReady;
}

type CellRow = {
  q: number;
  r: number;
  terrain_id: string | null;
  building_id: string | null;
  object_id: string | null;
  decoration_id: string | null;
  road_id: string | null;
  group_id: string | null;
  icon_scale: number | string | null;
};

/** Загрузить карту: клетки со всеми слоями + каталог ассетов всех kind'ов. */
export const castleEditorLoad = createServerFn({ method: "GET" }).handler(async () => {
  await requireCastleEditor();
  await ensureCastleTables();
  return loadCastleMap();
});

/** Игровое чтение для вошедших игроков. Не даёт прав редактора и не меняет схему. */
export const castleGameLoad = createServerFn({ method: "GET" }).handler(async () => {
  requireWallet();
  return loadCastleMap();
});

async function loadCastleMap() {
  // Ошибку базы НЕ глотаем: «пустая карта» вместо ошибки + «Сохранить» =
  // полная замена клеток пустотой. Лучше честная ошибка без кнопки.
  const [cells, assets] = await Promise.all([
    mcpExec(
      `SELECT q, r, terrain_id, building_id, object_id, decoration_id, road_id, group_id, icon_scale
         FROM yuplink.castle_map_cells WHERE map_id = ${sqlStr(CASTLE_INTERIOR_MAP_ID)};`,
      { wrapJson: true },
    ) as Promise<CellRow[]>,
    mcpExec(
      `SELECT id, kind, name, image_url, label_font_size, menu_action FROM yuplink.castle_terrain_template
        WHERE active = true ORDER BY created_at DESC;`,
      { wrapJson: true },
    ) as Promise<
      Array<{
        id: string;
        kind: string;
        name: string;
        image_url: string | null;
        label_font_size: number;
        menu_action: import("@/lib/castleMenus").Destination | null;
      }>
    >,
  ]);
  const record: Record<string, CastleCell> = {};
  for (const c of cells ?? []) {
    const cell: CastleCell = {
      terrainId: c.terrain_id,
      buildingId: c.building_id,
      objectId: c.object_id,
      decorationId: c.decoration_id,
      roadId: c.road_id,
      groupId: c.group_id,
      // numeric из pg приходит строкой — приводим и держим в пределах.
      iconScale: c.icon_scale == null ? null : clampIconScale(Number(c.icon_scale)),
    };
    // После удаления ассета строка может остаться со всеми NULL (ON DELETE
    // SET NULL) — такую не показываем как «закрашенную» клетку.
    if (hasContent(cell)) record[`${c.q},${c.r}`] = cell;
  }
  return { cells: record, assets: assets ?? [] };
}

const idField = z.string().min(1).max(120).nullable().default(null);
const cellSchema = z.object({
  terrainId: idField,
  buildingId: idField,
  objectId: idField,
  decorationId: idField,
  roadId: idField,
  groupId: idField,
  iconScale: z.number().min(ICON_SCALE_MIN).max(ICON_SCALE_MAX).nullable().default(null),
});

/** Ключ клетки «q,r» в пределах сетки 16×16 — иначе NaN уехал бы в SQL. */
const cellKeySchema = z.string().regex(/^(?:[0-9]|1[0-5]),(?:[0-9]|1[0-5])$/);

/** Сохранить: полная замена клеток карты одной поездкой (upsert + чистка лишних). */
export const castleEditorSave = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ cells: z.record(cellKeySchema, cellSchema) }).parse(d))
  .handler(async ({ data }) => {
    await requireCastleEditor();
    await ensureCastleTables();
    const map = sqlStr(CASTLE_INTERIOR_MAP_ID);
    const entries = Object.entries(data.cells)
      .map(([key, v]) => [key, { ...EMPTY, ...v }] as const)
      .filter(([, v]) => hasContent(v));
    if (entries.length === 0) {
      await mcpExec(`DELETE FROM yuplink.castle_map_cells WHERE map_id = ${map};`);
      return { ok: true as const, cells: 0 };
    }
    const n = (v: string | null) => (v ? sqlStr(v) : "NULL");
    // Масштаб хранится только у блоков (без groupId он бессмыслен).
    const sc = (v: CastleCell) =>
      v.groupId && v.iconScale != null ? String(clampIconScale(v.iconScale)) : "NULL";
    const values = entries
      .map(([key, v]) => {
        const [q, r] = key.split(",").map(Number);
        return `(${map}, ${q}, ${r}, ${n(v.terrainId)}, ${n(v.buildingId)}, ${n(v.objectId)}, ${n(v.decorationId)}, ${n(v.roadId)}, ${n(v.groupId)}, ${sc(v)}::numeric)`;
      })
      .join(",");
    const kept = entries
      .map(([key]) => {
        const [q, r] = key.split(",").map(Number);
        return `(${q}, ${r})`;
      })
      .join(",");
    await mcpExec(
      `WITH incoming(map_id, q, r, terrain_id, building_id, object_id, decoration_id, road_id, group_id, icon_scale) AS (
         VALUES ${values}
       ),
       upserted AS (
         INSERT INTO yuplink.castle_map_cells
           (map_id, q, r, terrain_id, building_id, object_id, decoration_id, road_id, group_id, icon_scale)
         SELECT map_id, q, r, terrain_id, building_id, object_id, decoration_id, road_id, group_id, icon_scale
           FROM incoming
         ON CONFLICT (map_id, q, r) DO UPDATE SET
           terrain_id = EXCLUDED.terrain_id, building_id = EXCLUDED.building_id,
           object_id = EXCLUDED.object_id, decoration_id = EXCLUDED.decoration_id,
           road_id = EXCLUDED.road_id, group_id = EXCLUDED.group_id,
           icon_scale = EXCLUDED.icon_scale
         RETURNING 1
       )
       DELETE FROM yuplink.castle_map_cells c
        WHERE c.map_id = ${map} AND (c.q, c.r) NOT IN (VALUES ${kept});`,
    );
    return { ok: true as const, cells: entries.length };
  });
