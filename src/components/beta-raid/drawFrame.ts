// Один кадр карты рейда: холст, камера, порядок слоёв.
//
// Вынесено из useMapRenderer (§13.1): там остался цикл кадров и движение
// героя, здесь — сама отрисовка. Логика не менялась при переносе.
import { R, axialToPixel } from "./hexGeometry";
import { drawCells, drawCastle, drawPendingTarget, drawMovesAndHero } from "./betaCanvasDraw";
import { drawVoidDome } from "./drawVoidDome";
import { drawRoute } from "./drawRoute";
import { drawGenSelected, drawGoalCell, drawPendingEdits } from "./betaCanvasOverlay";
import { drawMergeOverlay, type MergeSelection } from "./drawMergeOverlay";
import { drawFlash, type FlashMark } from "./drawFlash";
import type { HexTileCache } from "./hexTileCache";
import type { RoadRibbonCache } from "./roadRibbonCache";
import type { ChunkLayer } from "./chunkLayer";
import { drawStatic } from "./drawStatic";
import { drawWarehouseBadge } from "./drawWarehouseBadge";
import { spriteBucket, type SpriteCache } from "./spriteCache";
import type { FogView } from "./fogMask";
import type { MapIndex } from "./mapIndex";
import type { ShipMark } from "./drawShips";
import { frameStats } from "./frameStats";
import { drawLootBags } from "./loot-bag/drawLootBags";
import type { ChestMarks } from "@/lib/magicChest";
import type { LootBagMarks } from "@/lib/lootBag";
import type { GroundMarks } from "@/lib/digHole";
import { getPlayerDots } from "./playerDots";
import { getIslandGoal } from "./island/islandGoal";

export type RendererInput = {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  wrapRef: React.RefObject<HTMLDivElement | null>;
  badgeRef: React.RefObject<HTMLDivElement | null>;
  index: MapIndex;
  /** Карта, которую рисуем: по её смене печём тайлы заново (useMapRenderer). */
  mapId: string;
  buildingTiers: Record<string, number>;
  mineFlags?: Record<string, "own" | "enemy" | "tree">;
  mineGuards?: Record<string, { image: string | null }>;
  /** Магические сундуки: «q,r» → чей и картинка (getMagicChests). */
  magicChests?: ChestMarks;
  /** Мешочки и бугорки «второго обзора»: «q,r» → сколько и закопаны ли (§8.21). */
  lootBags?: LootBagMarks;
  /** Ямки от лопаты (рисуются на земле) и мои бугорки (02.10). */
  ground?: GroundMarks;
  fieldSlots?: Record<string, { used: number; max: number }>;
  warehouseBadges?: Record<string, { own: number; shared: number }>;
  runnerArrows?: Record<string, { toQ: number; toR: number }>;
  images: React.RefObject<Map<string, HTMLImageElement>>;
  objectRings: Map<string, string>;
  /** Объекты карты: objectId → { kind, rarity, level }. Для LOD-форм. */
  objects?: Record<string, { kind?: string | null; rarity?: string | null; level?: number | null }>;
  /** Кэш типов объектов: objectId → kind. Считается раз на карту. */
  objectKinds?: Map<string, string>;
  /** Зоны тумана номерами клеток — кэшируются, чтобы не пересчитывать каждый кадр. */
  fogZones?: { active: Set<number>; bright: Set<number> };
  /** Разведанное — маска по номерам клеток с журналом (fogMask). */
  seen: FogView;
  /** В обзоре сейчас — номерами клеток. */
  visible: Set<number>;
  /** Админ смотрит карту целиком — туман в кадре не спрашиваем вовсе. */
  revealAll?: boolean;
  /** Клетки под глухим туманом — купол поверх них рисует только админ. */
  voidCells?: Set<string>;
  centerQ: number;
  c0q: number;
  castle: { q: number; r: number };
  /** Замок есть только в главном мире; на других этажах его не рисуем. */
  castleShown?: boolean;
  playerPos: { q: number; r: number } | null;
  availableMoves: Array<{ q: number; r: number; cost: number }>;
  pendingPathTarget: { q: number; r: number; cost: number; steps: number } | null;
  /** Весь предложенный маршрут — рисуем его стрелками от героя до цели. */
  pendingPath: Array<{ q: number; r: number }>;
  /** Клетка → корабль на воде (занят ли, мой ли). */
  ships: Map<string, ShipMark>;
  /** Клетки с невыгруженными правками админа. */
  pendingCells?: Set<string>;
  /** Клетки, помеченные под биом-генератор — своя пунктирная обводка. */
  selectedForGen?: Set<string>;
  /** Режим «Объединить» (режим бога): набранные клетки и выбранный блок. */
  mergeSel?: MergeSelection;
  /** Клетка, которую подсветили из списка («Добыча»). Живёт полторы секунды. */
  flashRef?: React.RefObject<FlashMark | null>;
  offsetRef: React.RefObject<{ x: number; y: number }>;
  scaleRef: React.RefObject<number>;
  stepCamera: () => boolean;
};

const EMPTY_VOID: Set<string> = new Set();
const EMPTY_COVERED: Set<number> = new Set();
/** Сколько миллисекунд кадра отдаём выпечке кусков: в движении — меньше, чтобы жест не дёргался. */
const BAKE_MS_MOVING = 3;
const BAKE_MS_IDLE = 8;

/** Рисует кадр. true — статичный слой допечён не весь, нужен ещё кадр. */
export function drawFrame(
  s: RendererInput,
  tiles: HexTileCache,
  ribbons: RoadRibbonCache,
  chunks: ChunkLayer,
  sprites: SpriteCache,
  heroXY: { x: number; y: number } | null,
  // Правда — камера сейчас движется/зумит. Пока моргает жест, качество можно
  // ужать: «серая плёнка тумана» под каждой клеткой стоит fill на каждую из
  // сотен клеток и глотает fps.
  moving = false,
): boolean {
  // Счётчики кадра — до первого выхода: проба не должна получить прошлый кадр.
  frameStats.cells = 0;
  frameStats.bakes = 0;
  sprites.beginFrame();
  const cv = s.canvasRef.current;
  const wrap = s.wrapRef.current;
  if (!cv || !wrap) return false;
  const W = wrap.clientWidth;
  const H = wrap.clientHeight;
  if (W === 0 || H === 0) return false;

  // Динамический DPR: при отдалении canvas рисует меньше пикселей.
  // При scale < 0.2 — 0.75×, при scale < 0.4 — 1.0×, иначе — до 1.5×.
  // На максимуме отдаления fill rate падает в ~4×: 37k клеток × 0.75²
  // вместо 37k × 1.5². Деталей и так не видно — upscale незаметен.
  const baseDpr = Math.min(1.5, window.devicePixelRatio || 1);
  const scale = s.scaleRef.current ?? 1;
  const dpr = scale < 0.2 ? 0.75 : scale < 0.4 ? 1 : baseDpr;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    cv.style.width = W + "px";
    cv.style.height = H + "px";
  }
  const g = cv.getContext("2d");
  if (!g) return false;
  const offset = s.offsetRef.current ?? { x: 0, y: 0 };

  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = "#0a0d13";
  g.fillRect(0, 0, W, H);
  g.save();
  // Сдвиг камеры — на целый пиксель устройства: куски статичного слоя тогда
  // ложатся на холст 1:1 (chunkLayer), а глазу доля пикселя не видна.
  g.translate(
    Math.round((W / 2 + offset.x) * dpr) / dpr,
    Math.round((H / 2 + offset.y) * dpr) / dpr,
  );
  g.scale(scale, scale);

  // Видимый прямоугольник в координатах карты + гекс запаса по краям.
  const pad = R * 2;
  const view = {
    minX: (-W / 2 - offset.x) / scale - pad,
    maxX: (W / 2 - offset.x) / scale + pad,
    minY: (-H / 2 - offset.y) / scale - pad,
    maxY: (H / 2 - offset.y) / scale + pad,
  };

  const scene = {
    g,
    W,
    H,
    offset,
    scale,
    toPixel: (q: number, r: number) => axialToPixel(q, r, s.centerQ, s.c0q),
    images: s.images.current ?? new Map(),
    objectRings: s.objectRings,
    objects: s.objects,
    objectKinds: s.objectKinds,
    fogZones: s.fogZones,
    tiles,
    ribbons,
    view,
    covered: EMPTY_COVERED,
    buildingTiers: s.buildingTiers,
    mineFlags: s.mineFlags,
    mineGuards: s.mineGuards,
    magicChests: s.magicChests,
    digHoles: s.ground?.holes,
    fieldSlots: s.fieldSlots,
    warehouseBadges: s.warehouseBadges,
    // Бейджи складов копятся здесь и рисуются после тумана (см. ниже).
    deferredBadges: [] as Array<{ key: string; x: number; top: number }>,
    runnerArrows: s.runnerArrows,
    seen: s.seen,
    visible: s.visible,
    revealAll: s.revealAll === true,
    voidCells: s.voidCells ?? EMPTY_VOID,
    // Чужие игроки — из своего хранилища, мимо пропсов (playerDots).
    players: getPlayerDots(),
    ships: s.ships,
    pendingCells: s.pendingCells,
    selectedForGen: s.selectedForGen,
    heroCell: s.playerPos,
    /** Пока камера двигается — можно упростить кадры (см. betaCanvasDraw). */
    moving,
    sprites,
    bucket: spriteBucket(scale, dpr),
  };

  // Статичный слой кусками (местность, дороги, неразведанное), затем по
  // клеткам — что кусок не накрыл, и всё содержимое поверх.
  const stat = drawStatic(scene, s.index, chunks, dpr, moving ? BAKE_MS_MOVING : BAKE_MS_IDLE);
  scene.covered = stat.covered;
  drawCells(scene, s.index);
  // Бейджи складов — поверх плёнки тумана: число к сбору видно издалека.
  for (const b of scene.deferredBadges) drawWarehouseBadge(scene, b, b.top);
  // Мешочки — тем же слоем, поверх плёнки: их видно во всей активной зоне.
  drawLootBags(scene, s.index.store, s.lootBags);
  // Купол — сразу после клеток и до всего остального: он накрывает местность и
  // постройки, но не должен замывать маршрут, кружки ходов и героя.
  drawVoidDome(scene, s.index);
  if (s.castleShown !== false) drawCastle(scene, s.castle.q, s.castle.r);
  // Цель шага острова — рамка клетки поверх тумана (сам туман не открываем).
  const goal = getIslandGoal();
  if (goal) drawGoalCell(scene, goal);
  if (s.pendingPathTarget) drawPendingTarget(scene, s.pendingPathTarget);
  if (s.playerPos && s.pendingPath.length > 0) drawRoute(scene, s.playerPos, s.pendingPath);
  drawMovesAndHero(scene, s.availableMoves, heroXY ?? scene.toPixel(s.castle.q, s.castle.r));
  if (s.pendingCells?.size) drawPendingEdits(scene, s.pendingCells);
  if (s.selectedForGen?.size) drawGenSelected(scene, s.selectedForGen);
  if (s.mergeSel) drawMergeOverlay(scene, s.index.store, s.mergeSel);
  // Метка «вот эта клетка» — самой последней, поверх всего: её задача быть
  // заметной, а не соблюдать порядок слоёв.
  drawFlash(scene, s.flashRef?.current ?? null, performance.now());

  g.restore();
  return stat.pending > 0;
}
