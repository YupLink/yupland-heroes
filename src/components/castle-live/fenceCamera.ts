// Кадр замка «только внутри забора» (владелец, 07.10.2026): на телефоне и на
// компьютере видна площадь за белой оградой, без леса и гор вокруг. Ограда —
// объекты карты замка (Забор, Вертикаль, Горизонт, Углы…). Кадр режем по
// ВНУТРЕННЕЙ линии ограды: бока — по самому внутреннему зубцу (стена идёт
// «ёлочкой» через ряд), верх и низ — по рядам ограды; постройки (Ворота на
// линии ограды) всегда целиком. Площадь вписываем по меньшей стороне
// (телефон — по ширине, компьютер — по высоте), а холст — на весь экран.
import { CANVAS_W, HEX_SIZE, groupBox, hexCenter, parseKey } from "@/components/castle-editor/hexGeom";
import { clampIconScale } from "@/lib/mergeScale";
import type { CellMap } from "@/components/castle-editor/types";
import type { Bindings } from "@/lib/castleMenus";
import type { ImageBounds } from "./useBuildingImageBounds";

type Box = { x0: number; y0: number; x1: number; y1: number };
const union = (a: Box | null, b: Box): Box =>
  a
    ? {
        x0: Math.min(a.x0, b.x0),
        y0: Math.min(a.y0, b.y0),
        x1: Math.max(a.x1, b.x1),
        y1: Math.max(a.y1, b.y1),
      }
    : b;

export type FenceCamera = {
  /** Размер холста на экране, px. */
  width: number;
  height: number;
  viewBox: string;
  scrollLeft: number;
  /** Где холст стоит внутри области, px. */
  left: number;
  top: number;
  hasGates: boolean;
  zoomable: boolean;
  scrollTop: number;
};

/** Внутренняя рамка ограды по центрам её клеток; null — ограды нет. */
export function fenceInner(cells: CellMap): Box | null {
  const rows = new Map<number, { min: number; max: number }>();
  for (const [key, c] of Object.entries(cells)) {
    if (!c.objectId) continue;
    const [q, r] = parseKey(key);
    const [x, y] = hexCenter(q, r);
    const row = rows.get(y);
    rows.set(y, row ? { min: Math.min(row.min, x), max: Math.max(row.max, x) } : { min: x, max: x });
  }
  if (rows.size < 3) return null;
  const ys = [...rows.keys()].sort((a, b) => a - b);
  const top = ys[0];
  const bottom = ys[ys.length - 1];
  // Бока — по рядам между верхним и нижним: в них по зубцу слева и справа.
  const mid = ys.slice(1, -1).map((y) => rows.get(y)!);
  const x0 = Math.max(...mid.map((r) => r.min));
  const x1 = Math.min(...mid.map((r) => r.max));
  if (!(x1 > x0)) return null;
  // Верх — на полклетки ниже ряда ограды: кроны деревьев за ней рисуются
  // поверх стены и иначе торчали бы над площадью.
  return { x0, y0: top + HEX_SIZE * 0.5, x1, y1: bottom };
}

/** Рамка построек с их картинками (блок вылетает за клетки на icon_scale). */
function buildingsBox(cells: CellMap, bindings: Bindings, imageBounds: Record<string, ImageBounds>): { box: Box | null; hasGates: boolean } {
  let box: Box | null = null;
  let hasGates = false;
  const seen = new Set<string>();
  for (const [key, c] of Object.entries(cells)) {
    const gid = c.groupId ?? key;
    if (seen.has(gid)) continue;
    seen.add(gid);
    // Use the same first group cell as CastleCanvas, not hidden member layers.
    if (!c.buildingId) continue;
    if (Object.keys(bindings).length && !Object.hasOwn(bindings, c.buildingId)) continue;
    if (bindings[c.buildingId] === "gates") hasGates = true;
    const keys = c.groupId
      ? Object.keys(cells).filter((k) => cells[k].groupId === c.groupId)
      : [key];
    const b = groupBox(keys);
    const s = c.groupId ? clampIconScale(c.iconScale) : 1;
    const dx = (b.w * (s - 1)) / 2;
    const dy = (b.h * (s - 1)) / 2;
    const art = { x0: b.x - dx, y0: b.y - dy, x1: b.x + b.w + dx, y1: b.y + b.h + dy };
    const pixels = imageBounds[c.buildingId];
    if (pixels) {
      // Match SVG xMidYMid meet, then ignore transparent margins in the bitmap.
      const fit = Math.min((art.x1 - art.x0) / pixels.width, (art.y1 - art.y0) / pixels.height);
      const x = art.x0 + (art.x1 - art.x0 - pixels.width * fit) / 2;
      const y = art.y0 + (art.y1 - art.y0 - pixels.height * fit) / 2;
      box = union(box, { x0: x + pixels.x0 * fit, y0: y + pixels.y0 * fit, x1: x + pixels.x1 * fit, y1: Math.max(y + pixels.y1 * fit, b.y + b.h) });
    } else box = union(box, art);
  }
  return { box, hasGates };
}

export function fenceCamera(
  cells: CellMap,
  bindings: Bindings,
  W: number,
  H: number,
  insets: { top: number; bottom: number },
  imageBounds: Record<string, ImageBounds> = {},
  zoom = 1,
  verticalPan = false,
): FenceCamera {
  const { box: buildings, hasGates } = buildingsBox(cells, bindings, imageBounds);
  const fence = fenceInner(cells);
  // Ограды нет — постройки с запасом в клетку.
  const inner =
    fence ??
    (buildings && {
      x0: buildings.x0 - HEX_SIZE,
      y0: buildings.y0 - HEX_SIZE,
      x1: buildings.x1 + HEX_SIZE,
      y1: buildings.y1 + HEX_SIZE,
    });
  // Основной кадр — постройки, включая всю картинку ворот. Компактный запас
  // вместо целой клетки с каждой стороны приближает кадр примерно на ряд сот.
  // objectId бывает и у деревьев/камней: расширение окружения и ограды не
  // должно уменьшать здания. Вся карта остаётся фоном и доступна свайпом.
  const scenePadding = 8;
  const view =
    buildings
      ? { x0: buildings.x0 - scenePadding, y0: buildings.y0 - scenePadding,
          x1: buildings.x1 + scenePadding, y1: buildings.y1 + scenePadding }
      : (inner ?? {
          x0: 0,
          y0: 0,
          x1: 400,
          y1: 600,
        });
  const vw = Math.max(1, view.x1 - view.x0);
  const vh = Math.max(1, view.y1 - view.y0);
  const availH = Math.max(80, H - insets.top - insets.bottom);
  // Площадь внутри ограды вписана в полосу между кнопкой профиля и полосой
  // ресурсов; холст — на весь экран (владелец, 07.10: «карта не отдельным
  // блоком»): вокруг площади видно то, что вокруг замка, кнопки — поверх.
  // Высота построек заполняет пространство между HUD и ресурсами.
  // Ширина карты не отдаляет весь замок: края доступны горизонтальным свайпом.
  const closeScale = availH / vh;
  // Wide windows also need a usable minus/plus range, even when every building
  // already fits at the close scale.
  const overviewScale = Math.min(closeScale * .75, Math.max(1, W - 32) / vw);
  const progress = Number.isFinite(zoom) ? Math.max(0, Math.min(1, zoom)) : 1;
  const scale = overviewScale * Math.pow(closeScale / overviewScale, progress);
  const fullW = W / scale;
  const fullH = H / scale;
  const x0 = view.x0 - (fullW - vw) / 2;
  // Keep gates next to the resource rail at every zoom, without a blank band
  // under the castle. Extra landscape belongs above it when zoomed out.
  const y0 = view.y1 - (H - insets.bottom) / scale;
  const worldX0 = Math.min(0, x0);
  const worldX1 = Math.max(CANVAS_W, x0 + fullW);
  const canvasWidth = Math.max(W, (worldX1 - worldX0) * scale);
  return {
    width: canvasWidth,
    height: verticalPan ? H * 3 : H,
    viewBox: `${worldX0} ${verticalPan ? y0 - fullH : y0} ${canvasWidth / scale} ${verticalPan ? fullH * 3 : fullH}`,
    scrollTop: verticalPan ? H : 0,
    scrollLeft: (x0 - worldX0) * scale,
    left: 0,
    top: 0,
    hasGates,
    zoomable: closeScale > overviewScale * 1.01,
  };
}
