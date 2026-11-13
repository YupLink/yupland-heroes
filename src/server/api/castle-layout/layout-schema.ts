import {CASTLE_PLACEMENT,BUILDING_SIZE_MAX} from '@/lib/castlePlacementLimits';
// Расстановка замка (ModularCastleViewport) на сервере: ровно поля
// serializeModularLayout (components/castle-live/modularCastleLayout.ts), их типы
// и пределы. Пределы — те же, что у decodeModularLayout и редактора: дальше них
// клиент значение всё равно не примет.
//  · Координаты: x −2600…3400, y 330…1500 (ворота стоят на 330).
//  · Размер: 20…6000; baseSize: 20…600; редактор — до 1000%.
//  · Подпись: смещение ±240, шрифт 9,9…32, плашка 16…80.
//  · Клетки дорожек: целые ±70, до 1000 (столько оставляет decodeModularLayout);
//    участки дорог: 4 числа ±1600, до 1000 (рисовать дают до 160, стирание дробит).
//  · Объектов — до 400: 10 базовых + 5 покупных зданий + ~385 декора.
//  · Весь JSON — до 256 КБ: 400 объектов × ~300 Б + 1000 участков × ~75 Б +
//    1000 клеток × ~10 Б ≈ 205 КБ — предел с запасом, но не склад мусора.
// Стили — списки замка (appearanceStyles = buildingStyleIds = castlePathStyles =
// castleTerritoryStyles, сверяет layout-schema.test). Лишние поля отбрасываются.
import { z } from "zod";
import { appearanceStyles } from "@/components/castle-live/castleAppearanceAccess";

export const LAYOUT_MAX_ITEMS = 400;
export const LAYOUT_MAX_BYTES = 256 * 1024;
export const LAYOUT_MAX_PATH_CELLS = 1000;
export const LAYOUT_MAX_ROAD_SEGMENTS = 1000;

/** Стиль облика (здания, дорожки, земля): один из стилей замка. */
export type LayoutStyle = (typeof appearanceStyles)[number];

/** Один объект расстановки — то, что отдаёт serializeModularLayout. */
export type ModularLayoutItem = {
  id: string;
  x: number;
  y: number;
  size: number;
  caption: { x: number; y: number; font: number; height: number };
  placed?: boolean;
  captionHidden?: boolean;
  mirrored?: boolean;
  baseSize?: number;
  decor?: boolean;
  catalogId?: string;
  pathCells?: [number, number][];
  roadSegments?: [number, number, number, number][];
  roadStyle?: LayoutStyle;
  territoryStyle?: LayoutStyle;
  buildingStyle?: LayoutStyle;
};

/** Вход сохранения. Стили — строкой: незнакомый стиль сервер отклонит. */
export type ModularLayoutInput = Omit<
  ModularLayoutItem,
  "roadStyle" | "territoryStyle" | "buildingStyle"
> & { roadStyle?: string; territoryStyle?: string; buildingStyle?: string };

export type SaveCastleLayoutInput = { revision: number; layout: ModularLayoutInput[] };

/** id здания (shop, mine_office…) или декора «decor:<uuid>». */
export const LAYOUT_ID_RE = /^(?:[a-z][a-z0-9_]{0,31}|decor:[A-Za-z0-9-]{1,64})$/;
/** id вида декора из каталога замка: «tree», «elven-bench». */
export const DECOR_KIND_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

const num = (min: number, max: number) => z.number().finite().min(min).max(max);
const int = (min: number, max: number) => z.number().int().min(min).max(max);
const style = z.enum(appearanceStyles).optional();

const item = z
  .object({
    id: z.string().regex(LAYOUT_ID_RE),
    x: num(CASTLE_PLACEMENT.left, CASTLE_PLACEMENT.right),
    y: num(330, 1500),
    size: num(20, BUILDING_SIZE_MAX),
    caption: z.object({
      x: num(-240, 240),
      y: num(-240, 240),
      font: num(9.9, 32),
      height: num(16, 80),
    }),
    placed: z.boolean().optional(),
    captionHidden: z.boolean().optional(),
    mirrored: z.boolean().optional(),
    baseSize: num(20, 600).optional(),
    decor: z.boolean().optional(),
    catalogId: z.string().regex(DECOR_KIND_RE).optional(),
    pathCells: z
      .array(z.tuple([int(-70, 70), int(-70, 70)]))
      .max(LAYOUT_MAX_PATH_CELLS)
      .optional(),
    roadSegments: z
      .array(z.tuple([num(-1600, 1600), num(-1600, 1600), num(-1600, 1600), num(-1600, 1600)]))
      .max(LAYOUT_MAX_ROAD_SEGMENTS)
      .optional(),
    roadStyle: style,
    territoryStyle: style,
    buildingStyle: style,
  })
  // Декор узнаётся тремя признаками сразу: decor, «decor:»-id и вид каталога.
  .superRefine((v, ctx) => {
    const decorId = v.id.startsWith("decor:");
    if (v.decor === true && decorId && v.catalogId) return;
    if (v.decor !== true && !decorId && v.catalogId === undefined) return;
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["decor"], message: "decor" });
  });

const saveInput = z.object({
  revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  layout: z.array(item).max(LAYOUT_MAX_ITEMS),
});

/** Отказ ключом словаря (lib/translations/castle-layout.ts), с подстановками. */
export const layoutError = (key: string, params?: Record<string, string | number>): Error =>
  new Error(params ? `${key}|${JSON.stringify(params)}` : key);

/** Объектов больше предела — понятнее, чем «ошибка в поле layout». */
function tooMany(d: unknown): boolean {
  const layout = (d as { layout?: unknown } | null)?.layout;
  return Array.isArray(layout) && layout.length > LAYOUT_MAX_ITEMS;
}

export type SaveCastleLayoutData = { revision: number; layout: ModularLayoutItem[] };

/** Разбор входа сохранения: типы, пределы, размер JSON. */
export function parseSaveInput(d: unknown): SaveCastleLayoutData {
  if (tooMany(d)) throw layoutError("castle.layout_too_big");
  const r = saveInput.safeParse(d);
  if (!r.success) {
    const at = r.error.issues[0]?.path.join(".") || "layout";
    throw layoutError("castle.layout_bad", { at });
  }
  if (new TextEncoder().encode(JSON.stringify(r.data.layout)).length > LAYOUT_MAX_BYTES)
    throw layoutError("castle.layout_too_big");
  return r.data;
}

