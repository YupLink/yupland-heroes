// Отрисовка объединённых блоков: одна картинка постройки на весь блок.
//
// Кадр идёт по клеткам сверху вниз (forEachVisible). Картинка блока рисуется
// на ЯКОРЕ — последнем в этом порядке члене блока, на котором кадр реально
// дойдёт до постройки (разведан, без корабля и чужого лагеря — иначе клетка
// уходит из обхода раньше, и картинка пропадала бы, пока сосед стоит на
// клетке). Объекты и лагеря членов, нарисованных ДО якоря, откладываются и
// кладутся поверх картинки (drawCells) — босс на верхней клетке блока не
// прячется под крышей.
//
// Масштаб (1 … 2) растит картинку от центра по X и от «пола» (низ самой
// нижней клетки + 0.55R) по Y — постройка «стоит» на клетках, как одиночная.
// Без shadowBlur и засветов — правила канваса (CLAUDE.md).
import { R } from "./hexGeometry";
import type { DrawScene } from "./betaCanvasScene";
import { drawBuilding } from "./drawBuilding";
import { drawDecoration } from "./drawDecoration";
import { drawObject, drawRunnerArrow } from "./drawObject";
import { drawPlayerCamp, drawPlayerCount } from "./drawPlayers";
import { SceneCell, type MapIndex, type WorldView } from "./mapIndex";
import type { MapStore } from "./mapStore";
import { blocksOf, type Block, type Blocks } from "./mergeBlocks";
import { drawMagicChest } from "./chest/drawMagicChest";

/** Ведущая клетка блока как SceneCell — один объект на store, поля перезаписываем. */
const leadScratch = new WeakMap<MapStore, SceneCell>();

function leadCell(store: MapStore, i: number): SceneCell {
  let c = leadScratch.get(store);
  if (!c) {
    c = new SceneCell(store);
    leadScratch.set(store, c);
  }
  c.i = i;
  c.cell.i = i;
  c.q = store.packed.q[i];
  c.r = store.packed.r[i];
  c.x = store.geom.x[i];
  c.y = store.geom.y[i];
  return c;
}

/**
 * Годится ли клетка в якоря: разведана (у игрока) — картинку блока кладём до
 * корабля и лагеря самой клетки (drawCells), поэтому те не мешают.
 */
export function makeCanAnchor(scene: DrawScene): (i: number) => boolean {
  const { revealAll, visible, seen } = scene;
  return (i) => revealAll || visible.has(i) || seen.hasIndex(i);
}

export type BlockPlan = {
  /** Номер клетки-якоря → блок, который рисуется на ней. */
  anchors: Map<number, Block>;
  /**
   * Блоки, чьи клетки все вне кадра, а картинка (до ×2 по высоте) ещё в кадре:
   * рисуются после обхода клеток — под ними в кадре ничего нет.
   */
  offscreen: Block[];
};

/**
 * Якоря кадра. `canAnchor(i)` — дойдёт ли кадр на клетке i до постройки.
 * Куллинг — по картинке, не по центрам: над блоком она выступает вверх до
 * 10R и на масштабе ×2 ещё занимала бы треть экрана, когда клетки уже ушли.
 */
export function planBlocks(
  blocks: Blocks,
  index: MapIndex,
  view: WorldView,
  canAnchor: (i: number) => boolean,
): BlockPlan {
  const plan: BlockPlan = { anchors: new Map(), offscreen: [] };
  if (blocks.list.length === 0) return plan;
  const g = index.store.geom;
  for (const b of blocks.list) {
    const w = (b.maxX - b.minX) * b.scale;
    // Запас по высоте картинки: постройка до 2 ширин, декор 0,88w × до 1:3
    // (REACH.dec) ≈ 2,65w — иначе крона у нижнего края экрана пропадала скачком.
    const reachUp = w * 2.65;
    if (
      b.maxX + w < view.minX ||
      b.minX - w > view.maxX ||
      b.maxY + R < view.minY ||
      b.minY - reachUp > view.maxY
    )
      continue;
    let anchor = -1;
    let lastInView = -1;
    for (const i of b.cells) {
      const x = g.x[i];
      const y = g.y[i];
      if (x < view.minX || x > view.maxX || y < view.minY || y > view.maxY) continue;
      lastInView = i;
      if (canAnchor(i)) anchor = i; // члены отсортированы (r ↑, q ↑) — последний годный
    }
    // Годного якоря нет (на всех членах в кадре чужой лагерь/корабль) — берём
    // последний в кадре: drawCells рисует блок на якоре до лагеря и корабля.
    if (anchor < 0) anchor = lastInView;
    if (anchor >= 0) plan.anchors.set(anchor, b);
    else plan.offscreen.push(b);
  }
  return plan;
}

/**
 * Нарисовать блок: декор, поверх — постройку, оба одной картинкой на весь
 * блок. Возвращает верх картинки постройки (для флажка лагеря) или null —
 * постройки нет или ни одна клетка блока ещё не разведана.
 */
export function drawBlock(scene: DrawScene, store: MapStore, b: Block): number | null {
  if (b.lead < 0 && b.leadDecor < 0) return null;
  // Разведка — по любой клетке блока: картинка лежит на всех них.
  if (!scene.revealAll) {
    let seen = false;
    for (const i of b.cells) {
      if (scene.visible.has(i) || scene.seen.hasIndex(i)) {
        seen = true;
        break;
      }
    }
    if (!seen) return null;
  }
  // Ширина — по рамке блока (высота — по пропорции картинки, вверх она
  // выступает как и одиночная постройка), дальше масштаб от центра и пола.
  // Не вписываем по высоте: узкий высокий блок дал бы картинку МЕНЬШЕ одиночной.
  const w = (b.maxX - b.minX) * b.scale;
  const cx = (b.minX + b.maxX) / 2;
  const bottom = b.yLow + R * 0.55;
  // Декор ПОД постройкой — как в испечённом куске и в редакторе замка: иначе
  // куст размером с блок накрывал бы шахту вместе с охранником и флагом.
  // Декор одиночной клетки — 1,5R против 1,7R у постройки: та же пропорция и у блока.
  const decorationId = b.leadDecor >= 0 ? store.decorationId(b.leadDecor) : undefined;
  if (decorationId) drawDecoration(scene, { x: cx, y: b.yLow }, decorationId, w * (1.5 / 1.7));
  const buildingId = b.lead >= 0 ? store.buildingId(b.lead) : undefined;
  return buildingId
    ? drawBuilding(scene, leadCell(store, b.lead), buildingId, { cx, bottom, w })
    : null;
}

export { blocksOf };

/** Что на члене блока отложено до картинки: объект, лагерь, счёт игроков. */
export type Deferred = { i: number; crowd: number | undefined; inDarkFog: boolean };

/**
 * Дорисовать отложенное членов блока ПОВЕРХ его картинки — тем же порядком и
 * теми же правилами, что и у одиночной клетки в drawCells (лагерь вместо
 * объекта; счёт — у героя и у постройки).
 */
export function drawDeferred(
  scene: DrawScene,
  store: MapStore,
  list: Deferred[],
  hasRunners: boolean,
  /**
   * Картинка блока — постройка. Тогда игроки на любой его клетке — как на
   * клетке постройки: счётчик без лагеря. Иначе лагерь члена, нарисованный
   * поверх картинки, лежал на крыше, хотя стоит за ней (ратуша Юпленда, 10.10).
   */
  overBuilding = false,
): void {
  for (const d of list) {
    const c = leadCell(store, d.i);
    const isHero = !!scene.heroCell && scene.heroCell.q === c.q && scene.heroCell.r === c.r;
    // Сундук на клетке блока без постройки — как в drawCells: лагерь его не замещает.
    const chest = scene.magicChests?.[c.key];
    if (d.crowd && !isHero && !c.cell.buildingId && !chest && !overBuilding) {
      drawPlayerCamp(scene, c, d.crowd);
      continue;
    }
    if (chest) drawMagicChest(scene, c, chest, !c.cell.buildingId);
    // Декор члена не рисуем: его положил drawBlock одной картинкой на весь блок.
    if (c.cell.objectId) drawObject(scene, c, c.cell, d.inDarkFog);
    if (hasRunners) drawRunnerArrow(scene, c);
    if (d.crowd && (isHero || c.cell.buildingId || chest || overBuilding))
      drawPlayerCount(scene, c, d.crowd);
  }
}
