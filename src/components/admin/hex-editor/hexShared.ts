// Геометрия гекса + доменные типы редактора карт. Вынесено из
// admin.hex-editor.tsx при декомпозиции (§13.1) — используется и самой
// страницей, и попапами редактирования объектов/местности.
import { Skull, Gem, Package, Pickaxe } from "lucide-react";

// ─── Геометрия pointy-top гекса ───
export const SQRT3 = Math.sqrt(3);
export type Axial = { q: number; r: number };
export type Offset = { col: number; row: number };
export const DIRS: Axial[] = [
  { q: +1, r: 0 },
  { q: -1, r: 0 },
  { q: 0, r: +1 },
  { q: 0, r: -1 },
  { q: +1, r: -1 },
  { q: -1, r: +1 },
];
export const key = (q: number, r: number) => `${q},${r}`;
export const parseKey = (k: string): Axial => {
  const [q, r] = k.split(",").map(Number);
  return { q, r };
};
// odd-r offset ↔ axial (pointy-top)
export const offsetToAxial = (col: number, row: number): Axial => ({
  q: col - ((row - (row & 1)) >> 1),
  r: row,
});
export const axialToOffset = (q: number, r: number): Offset => ({
  col: q + ((r - (r & 1)) >> 1),
  row: r,
});
export const inBoundsOffset = (o: Offset, size: number) =>
  o.col >= 0 && o.col < size && o.row >= 0 && o.row < size;
export const inBoundsAxial = (a: Axial, size: number) =>
  inBoundsOffset(axialToOffset(a.q, a.r), size);

export function axialToPixel(q: number, r: number, R: number) {
  return { x: R * SQRT3 * (q + r / 2), y: R * 1.5 * r };
}
export function pixelToAxial(x: number, y: number, R: number): Axial {
  const qf = ((SQRT3 / 3) * x - (1 / 3) * y) / R;
  const rf = ((2 / 3) * y) / R;
  const sf = -qf - rf;
  let q = Math.round(qf),
    r = Math.round(rf),
    s = Math.round(sf);
  const dq = Math.abs(q - qf),
    dr = Math.abs(r - rf),
    ds = Math.abs(s - sf);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return { q, r };
}
export function hexDist(a: Axial, b: Axial) {
  return (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;
}

// ─── Ассеты ───
export type TerrainDef = {
  id: string;
  label: string;
  file: string;
  cost: number;
  /** meta целиком: adminUpdateItem перезаписывает её, а не сливает по полям. */
  meta?: Record<string, unknown>;
};
// Sub-режимы объектов. У каждого — свой источник ассетов из БД (кроме chest —
// он у нас один общий-условный, отдельной таблицы «сундуков» нет).
export const OBJECT_SUBS = [
  { key: "boss", label: "Боссы", icon: Skull, color: "#e11d48", emoji: "💀" },
  { key: "artifact", label: "Артефакты", icon: Gem, color: "#a855f7", emoji: "💎" },
  { key: "chest", label: "Сундуки", icon: Package, color: "#f6c453", emoji: "📦" },
  { key: "mine", label: "Шахты", icon: Pickaxe, color: "#78716c", emoji: "⛏️" },
] as const;
export type ObjectSub = (typeof OBJECT_SUBS)[number]["key"];
// Герои УДАЛЕНЫ из hex-editor — они не должны размещаться на карте как мобы.
// objectId в Cell — "<sub>:<templateId>" для всех типов.
export function parseObjectId(id: string): { sub: ObjectSub; refId?: string } | null {
  if (!id) return null;
  const [sub, refId] = id.split(":");
  if (!sub) return null;
  if (sub !== "boss" && sub !== "artifact" && sub !== "chest" && sub !== "mine") return null;
  return { sub: sub as ObjectSub, refId };
}
export type Mode = "terrain" | "road" | "object" | "decoration" | "building" | "erase";

export type Cell = {
  terrainId: string | null;
  roadId?: string | null; // дорога клетки — она ОДНА, кисть её заменяет
  objectId?: string | null;
  junction?: boolean;
  shoulder?: boolean; // авто-обочина (приглушённая, поверх terrain)
  // Чисто визуальный декор (дерево/куст) — накладывается на terrain, без
  // взаимодействия и логики. Отдельное поле от objectId нарочно: декор не
  // должен блокировать проход, драться или как-то фигурировать в энкаунтерах.
  decorationId?: string | null;
  /** Постройка: объект, который игрок улучшает за ресурс (свой набор тиров). */
  buildingId?: string | null;
  /** Настройки постройки именно на этой клетке (у дерева — цены прокачки). */
  buildingConfig?: unknown;
  /** Переопределения объекта именно на этой клетке (HP, награды и т.п.).
   *  Каждый босс на карте — самостоятельный экземпляр, а не общий шаблон. */
  objectConfig?: unknown;
  /**
   * Купол глухого тумана ПОВЕРХ клетки — не слой местности. Игрок такую клетку
   * не видит и не пройдёт, а всё, что под ней (местность, дорога, объект,
   * постройка), остаётся нетронутым и возвращается при снятии купола.
   */
  voidFog?: boolean;
};
export type MapState = { size: 128 | 256 | 512; cells: Record<string, Cell> };
export type UndoOp = { patches: Array<{ k: string; prev: Cell | null; next: Cell | null }> };

// ─── Библиотека карт (localStorage) ───
export type SavedMap = {
  id: string;
  name: string;
  size: 128 | 256 | 512;
  cells: Record<string, Cell>;
  updatedAt: string;
};
export const LIB_KEY = "hex-editor:library:v1";
export const CUR_KEY = "hex-editor:current:v1"; // id последней открытой карты
export function loadLibrary(): SavedMap[] {
  try {
    const raw = localStorage.getItem(LIB_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as SavedMap[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
export function persistLibrary(arr: SavedMap[]) {
  localStorage.setItem(LIB_KEY, JSON.stringify(arr));
}

export const LS_KEY = "hex-editor:state:v2"; // fallback для черновика без имени
export const CENTER = (size: number) => {
  const c = Math.floor(size / 2);
  return offsetToAxial(c, c);
};
export const centerKey = (size: number) => {
  const a = CENTER(size);
  return key(a.q, a.r);
};

// ─── Примитивы отрисовки гекса на canvas ───
export function hexPath(g: CanvasRenderingContext2D, cx: number, cy: number, R: number) {
  g.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    const x = cx + R * Math.cos(a),
      y = cy + R * Math.sin(a);
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
}
export function drawHex(
  g: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  R: number,
  fill: string,
  stroke: string,
) {
  hexPath(g, cx, cy, R);
  g.fillStyle = fill;
  g.fill();
  g.lineWidth = 1;
  g.strokeStyle = stroke;
  g.stroke();
}
export function drawHexOutline(
  g: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  R: number,
  stroke: string,
  w: number,
) {
  hexPath(g, cx, cy, R);
  g.lineWidth = w;
  g.strokeStyle = stroke;
  g.stroke();
}

/**
 * Правки клетки, не потеряв снимок босса.
 *
 * В `object_config` живут две разные вещи: собственные настройки клетки
 * (верхним уровнем) и снимок удалённого шаблона под ключом `tpl` — по нему
 * босс работает, когда заготовки уже нет (server/api/beta-raid/boss-snapshot).
 * Сохранение из редактора клали свой объект целиком и снимок затирали: босс
 * оставался без имени, картинки и HP и снова становился чёрной точкой.
 */
export function withKeptSnapshot(prev: unknown, next: Record<string, unknown> | null): unknown {
  const snap = (prev as Record<string, unknown> | null | undefined)?.tpl;
  if (snap === undefined) return next ?? undefined;
  return { ...(next ?? {}), tpl: snap };
}
