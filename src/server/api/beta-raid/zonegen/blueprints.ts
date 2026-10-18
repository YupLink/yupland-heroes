// Шаблоны городов в базе: прочитать список, переписать один, удалить.
//
// Отдельно от ручек (blueprints-api.ts), потому что дело здесь одно и сугубо
// серверное — текст SQL и разбор строк. Ручка остаётся тонкой, а правило «что
// именно лежит в шаблоне» читается одним файлом, и тест читает его же.
//
// Предустановленные шаблоны (`preset:…`) сюда не попадают: они считаются из
// справочника (lib/raid/zonegen/blueprint-presets) и в базе не живут. Отсюда
// два отказа — перезаписать и удалить их нельзя.
import { nanoid } from "nanoid";
import { z } from "zod";
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import {
  SETTLEMENT_LAYOUTS,
  settlementSlotSchema,
  TOWN_KINDS,
  type TownKind,
  type SettlementLayout,
  type SettlementSlot,
} from "@/lib/raid/zonegen/settlement-types";
import {
  BLUEPRINT_NAME_MAX,
  blueprintBodySchema,
  isPresetBlueprint,
  type TownBlueprint,
} from "@/lib/raid/zonegen/blueprint-types";

const TABLE = "yuplink.raid_town_blueprint";
/** Свой шаблон: префикс — чтобы перезапись не могла попасть в чужую строку. */
const OWN_ID = /^tbp_[A-Za-z0-9_-]{4,32}$/;

export const saveBlueprintInputSchema = z.object({
  /** Нет id — новый шаблон; есть — перезаписываем именно его (имя не ключ). */
  id: z.string().min(1).max(40).optional(),
  name: z.string().trim().min(1).max(BLUEPRINT_NAME_MAX),
  note: z.string().trim().max(200).optional(),
  settlement: blueprintBodySchema,
});
export type SaveBlueprintInput = z.infer<typeof saveBlueprintInputSchema>;

export const deleteBlueprintInputSchema = z.object({ id: z.string().min(1).max(64) });

/**
 * Автоподбор (auto/buildings/theme/kind, миграция town-06) читаем через to_jsonb:
 * пока колонок нет, ключа просто нет в строке — список не падает, а старые
 * шаблоны читаются ручным составом, как и были сохранены.
 */
export const listBlueprintsSql = (): string =>
  `SELECT b.id, b.name, b.layout, b.size, b.density, b.road_id AS "roadId", b.built,
          b.slots, b.note, b.updated_at AS "updatedAt",
          to_jsonb(b)->'auto' AS auto, to_jsonb(b)->'buildings' AS buildings,
          to_jsonb(b)->>'theme' AS theme, to_jsonb(b)->>'kind' AS kind
     FROM ${TABLE} b ORDER BY b.updated_at DESC, b.name;`;

const jsonb = (v: unknown): string => `${sqlStr(JSON.stringify(v))}::jsonb`;

/**
 * Запись шаблона. `created_by` при перезаписи не трогаем: автор строки — тот,
 * кто её завёл, а не тот, кто последним поправил плотность.
 */
export function upsertBlueprintSql(bp: TownBlueprint, createdBy: string): string {
  return `INSERT INTO ${TABLE}
      (id, name, layout, size, density, road_id, built, slots, note, created_by)
    VALUES (${sqlStr(bp.id)}, ${sqlStr(bp.name)}, ${sqlStr(bp.layout)}, ${Math.round(bp.size)},
            ${bp.density}, ${bp.roadId === null ? "NULL" : sqlStr(bp.roadId)},
            ${bp.built}, ${jsonb(bp.slots)},
            ${bp.note === null ? "NULL" : sqlStr(bp.note)}, ${sqlStr(createdBy)})
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name, layout = EXCLUDED.layout, size = EXCLUDED.size,
      density = EXCLUDED.density, road_id = EXCLUDED.road_id, built = EXCLUDED.built,
      slots = EXCLUDED.slots, note = EXCLUDED.note,
      updated_at = now();`;
}

/**
 * Автоподбор — отдельной записью: до миграции town-06 колонок нет, и общий
 * UPSERT с ними отверг бы и сам шаблон. Так шаблон сохраняется всегда, а
 * масштаб и тема — как только колонки появятся.
 */
export const blueprintAutoSql = (bp: TownBlueprint): string =>
  `UPDATE ${TABLE} SET auto = ${bp.auto}, buildings = ${Math.round(bp.buildings)},
          theme = ${sqlStr(bp.theme)}, kind = ${sqlStr(bp.kind)}
    WHERE id = ${sqlStr(bp.id)};`;

export const deleteBlueprintSql = (id: string): string =>
  `DELETE FROM ${TABLE} WHERE id = ${sqlStr(id)};`;

type Row = {
  id: string;
  name: string | null;
  layout: string | null;
  size: number | string | null;
  density: number | string | null;
  roadId: string | null;
  built: boolean | string | null;
  slots: unknown;
  note: string | null;
  updatedAt: string | null;
  auto?: unknown;
  buildings?: unknown;
  theme?: unknown;
  kind?: unknown;
};

/** Мост отдаёт boolean как есть, psql — буквой «t»: понимаем оба. */
const asBool = (v: unknown, dflt: boolean): boolean => {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v === "t" || v === "true";
  return dflt;
};

const clamp = (v: unknown, lo: number, hi: number, dflt: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
};

/**
 * Строка базы → шаблон. Всё чинится на месте: строку могли поправить руками в
 * psql, и «layout = кольцо» не должен ронять всю панель — он должен стать
 * планировкой по умолчанию (органический рост). Слоты прогоняем схемой: чужой
 * JSON в составе поедет прямо в планировщик.
 *
 * Нет `auto` — это шаблон до 25.09 или база до town-06: он сохранён ручным
 * составом (владелец собирал свои наборы), и автоподбор его затёр бы.
 */
export function toBlueprint(row: Row): TownBlueprint {
  const raw = typeof row.slots === "string" ? safeJson(row.slots) : row.slots;
  const parsed = z.array(settlementSlotSchema).max(60).safeParse(raw);
  const slots: SettlementSlot[] = parsed.success ? parsed.data : [];
  const layout = (SETTLEMENT_LAYOUTS as readonly string[]).includes(row.layout ?? "")
    ? (row.layout as SettlementLayout)
    : "organic";
  return {
    id: String(row.id),
    name: String(row.name ?? row.id),
    layout,
    size: Math.round(clamp(row.size, 2, 25, 7)),
    density: clamp(row.density, 0.05, 0.8, 0.26),
    slots,
    roadId: row.roadId === null || row.roadId === undefined ? null : String(row.roadId),
    built: asBool(row.built, true),
    note: row.note === null || row.note === undefined ? null : String(row.note),
    updatedAt: row.updatedAt === null || row.updatedAt === undefined ? null : String(row.updatedAt),
    auto: asBool(row.auto, false),
    buildings: Math.round(clamp(row.buildings ?? NaN, 3, 40, 12)),
    theme: typeof row.theme === "string" ? row.theme.slice(0, 40) : "",
    kind: (TOWN_KINDS as readonly unknown[]).includes(row.kind) ? (row.kind as TownKind) : "auto",
  };
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return [];
  }
}

/**
 * Сохранённые шаблоны. Отказ базы гасим пустым списком: миграцию могли ещё не
 * накатить, и панель должна открыться с предустановленными, а не белым экраном.
 */
export async function listBlueprints(): Promise<TownBlueprint[]> {
  const rows = ((await mcpExec(listBlueprintsSql(), { wrapJson: true }).catch(() => [])) ??
    []) as Row[];
  return rows.map(toBlueprint);
}

/** Сохранить или переписать свой шаблон; вернуть его же — панели для списка. */
export async function saveBlueprint(
  input: SaveBlueprintInput,
  createdBy: string,
): Promise<TownBlueprint> {
  const id = (input.id ?? "").trim();
  if (id !== "" && isPresetBlueprint(id)) {
    throw new Error("Предустановленный шаблон перезаписать нельзя — сохрани его как свой");
  }
  if (id !== "" && !OWN_ID.test(id)) throw new Error(`Непонятный id шаблона: ${id}`);
  const bp: TownBlueprint = {
    ...input.settlement,
    id: id === "" ? `tbp_${nanoid(10)}` : id,
    name: input.name,
    note: input.note === undefined || input.note === "" ? null : input.note,
    updatedAt: new Date().toISOString(),
  };
  await mcpExec(upsertBlueprintSql(bp, createdBy));
  // Не накатили town-06 — шаблон уже записан, теряется только автоподбор.
  await mcpExec(blueprintAutoSql(bp)).catch((e: unknown) => {
    console.warn("[blueprints] автоподбор не записан (нет миграции town-06?)", String(e));
  });
  return bp;
}

/** Удалить свой шаблон. Клеток на карте это не касается — шаблон не постройка. */
export async function deleteBlueprint(id: string): Promise<void> {
  if (isPresetBlueprint(id)) throw new Error("Предустановленный шаблон удалить нельзя");
  await mcpExec(deleteBlueprintSql(id));
}
