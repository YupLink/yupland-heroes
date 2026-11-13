// Режим стройки и чертёж шахты в кадре карты (ПРАВИЛА §8.59 п. 8):
//  · круг кандидатов — зелёные и красные гексы, ДВЕ заливки и две обводки на
//    кадр, сколько бы клеток ни было (без теней и save/restore на клетку);
//  · призрак заготовки — на клетке под пальцем: на зелёной клетке — картинка
//    «можно поставить», на красной — «нельзя поставить» из набора Ангелины
//    (lib/mineArt, уже полупрозрачные); пока круг не пришёл или картинка едет —
//    обычная шахта на 60 %. Рамка клетки — цветом клетки (белая без круга).
//    Можно ли — решает сервер (круг кандидатов), картинка только показывает;
//  · мой чертёж — синий пунктир по гексу и бледная шахта. Виден только мне и
//    только на своей карте.
// Данные — mineBuildStore; кадр будит подписка (useMapRenderer), своего rAF нет.
import { R } from "../hexGeometry";
import { MINE_PLACE_BUILDING, type PlaceableBlueprint } from "@/lib/minePlacement";
import { candidateAt, type MineCandidate } from "@/lib/mineBuild";
import { getMineBuild, planOnMap } from "./mineBuildStore";
import { MINE_ART_W, mineArtRect } from "../mine-art/drawMineArt";
import { mineArtKey } from "@/lib/mineArt";

type Scene = {
  g: CanvasRenderingContext2D;
  scale: number;
  toPixel: (q: number, r: number) => { x: number; y: number };
  images: Map<string, HTMLImageElement>;
};

export const BUILD_COLOR = {
  ok: "#37d67a",
  okFill: "rgba(55, 214, 122, 0.30)",
  bad: "#ff5470",
  badFill: "rgba(255, 84, 112, 0.30)",
  idle: "rgba(236, 236, 245, 0.85)",
  plan: "#5ab4ff",
  planFill: "rgba(90, 180, 255, 0.16)",
} as const;

/** Шесть углов гекса радиуса R — один раз на модуль (§9.1.3: без sin/cos в кадре). */
const CORNERS: ReadonlyArray<readonly [number, number]> = Array.from({ length: 6 }, (_, i) => {
  const a = (Math.PI / 180) * (60 * i - 30);
  return [R * Math.cos(a), R * Math.sin(a)] as const;
});

/** Контур гекса — в текущий путь (без beginPath): весь круг одним путём. */
function addHex(g: CanvasRenderingContext2D, x: number, y: number, k = 1): void {
  g.moveTo(x + CORNERS[0][0] * k, y + CORNERS[0][1] * k);
  for (let i = 1; i < 6; i++) g.lineTo(x + CORNERS[i][0] * k, y + CORNERS[i][1] * k);
  g.closePath();
}

/** Одна краска на все клетки круга одного цвета. */
function tint(s: Scene, cells: readonly MineCandidate[], ok: boolean): void {
  const { g } = s;
  g.beginPath();
  let any = false;
  for (const c of cells) {
    if (c.ok !== ok) continue;
    const p = s.toPixel(c.q, c.r);
    addHex(g, p.x, p.y, 0.94);
    any = true;
  }
  if (!any) return;
  g.fillStyle = ok ? BUILD_COLOR.okFill : BUILD_COLOR.badFill;
  g.fill();
  g.strokeStyle = ok ? BUILD_COLOR.ok : BUILD_COLOR.bad;
  g.lineWidth = Math.max(1.5, 1.5 / s.scale);
  g.stroke();
}

/** Картинка шахты на клетке с прозрачностью; картинка ещё едет — ничего (без серых прямоугольников, 29.10). */
function ghostArt(s: Scene, kind: PlaceableBlueprint, q: number, r: number, alpha: number): void {
  const { g } = s;
  const img = s.images.get(`b:${MINE_PLACE_BUILDING[kind]}:0`);
  if (!img?.complete || !(img.naturalWidth > 0)) return;
  const p = s.toPixel(q, r);
  const w = R * 1.7;
  const bottom = p.y + R * 0.55;
  const h = w * (img.naturalHeight / img.naturalWidth);
  g.globalAlpha = alpha;
  g.drawImage(img, p.x - w / 2, bottom - h, w, h);
  g.globalAlpha = 1;
}

/**
 * Призрак на клетке круга — картинка набора «можно/нельзя поставить» того вида,
 * что ставится, в прямоугольнике обычной шахты. false — картинка ещё едет.
 */
function ghostState(s: Scene, kind: PlaceableBlueprint, q: number, r: number, ok: boolean) {
  const img = s.images.get(mineArtKey(kind, ok ? "can-place" : "cannot-place"));
  if (!img?.complete || !(img.naturalWidth > 0)) return false;
  const p = s.toPixel(q, r);
  const a = mineArtRect(img, p.x, p.y + R * 0.55, MINE_ART_W);
  s.g.drawImage(img, a.x, a.y, a.w, a.h);
  return true;
}

/** Рамка клетки: сплошная — призрак, пунктир — чертёж. */
function frame(s: Scene, q: number, r: number, color: string, fill: string | null, dash: boolean) {
  const { g } = s;
  const p = s.toPixel(q, r);
  g.beginPath();
  addHex(g, p.x, p.y);
  if (fill) {
    g.fillStyle = fill;
    g.fill();
  }
  if (dash) g.setLineDash([R * 0.28, R * 0.18]);
  g.strokeStyle = color;
  g.lineWidth = Math.max(2.5, 2.5 / s.scale);
  g.stroke();
  if (dash) g.setLineDash([]);
}

/** Режим стройки и чертёж — поверх клеток, под героем. */
export function drawMineBuild(s: Scene): void {
  const b = getMineBuild();
  const plan = planOnMap();
  // Чертёж: под призраком того же места не дублируем.
  if (plan && !(b?.ghost && b.ghost.q === plan.q && b.ghost.r === plan.r)) {
    frame(s, plan.q, plan.r, BUILD_COLOR.plan, BUILD_COLOR.planFill, true);
    ghostArt(s, plan.kind, plan.q, plan.r, 0.45);
  }
  if (!b) return;
  if (b.cells) {
    tint(s, b.cells, true);
    tint(s, b.cells, false);
  }
  if (!b.ghost) return;
  const at = candidateAt(b.cells, b.ghost);
  const color = !at ? BUILD_COLOR.idle : at.ok ? BUILD_COLOR.ok : BUILD_COLOR.bad;
  frame(s, b.ghost.q, b.ghost.r, color, null, false);
  if (!at || !ghostState(s, b.kind, b.ghost.q, b.ghost.r, at.ok))
    ghostArt(s, b.kind, b.ghost.q, b.ghost.r, 0.6);
}
