// Отрисовка гекс-карты бета-рейда. Вынесено из BetaRaidCanvas (§13.1).
// Никаких эмодзи на канвасе — замок и герой рисуются примитивами.
//
// Кадр идёт по заранее построенному индексу (mapIndex.ts): порядок «сверху
// вниз» и координаты клеток посчитаны один раз на карту, а не каждый кадр.
import { R, hexPath2D } from "./hexGeometry";
import type { MapStore } from "./mapStore";
import { drawDecoration } from "./drawDecoration";
import { hasContentAbove } from "./decorFront";
import { drawBuilding } from "./drawBuilding";
import { drawObject, drawRunnerArrow } from "./drawObject";
import { forEachVisible, type MapIndex, type SceneCell } from "./mapIndex";
import { chunkId, chunkX, chunkY } from "./chunkIndex";
import { drawCampFlag, drawPlayerCamp, drawPlayerCount } from "./drawPlayers";
import { drawShip } from "./drawShips";
import {
  blocksOf,
  drawBlock,
  drawDeferred,
  makeCanAnchor,
  planBlocks,
  type Deferred,
} from "./drawMergedBlocks";
import type { Block } from "./mergeBlocks";
import { COLOR, type DrawScene } from "./betaCanvasScene";
import { drawGround, touchesSeen } from "./drawGround";
import { drawMagicChest } from "./chest/drawMagicChest";
import { drawDigHole } from "./tool/drawDigHole";
import { frameStats } from "./frameStats";

export type { DrawCell, DrawScene } from "./betaCanvasScene";
export {
  drawCastle,
  drawGenSelected,
  drawPendingTarget,
  drawMovesAndHero,
} from "./betaCanvasOverlay";

const EMPTY_IDX: Set<number> = new Set();
/** Туман: лёгкая серая пелена для активной зоны (2-3 тона светлее основного). */
const FOG_LIGHT = "rgba(10, 14, 22, 0.3)";
/** Туман: серая пелена для исторически разведанного (чуть темнее активной зоны). */
const FOG_DARK = "rgba(10, 14, 22, 0.42)";

/**
 * Клетки: местность, дорога, объекты, туман войны. Под неразведанным пусто.
 *
 * Порядок внутри клетки: местность → дорога → затемнение
 * «разведано, но вне обзора» → корабль/лагерь → постройка → декор → объект →
 * счётчик игроков. Дорога лежит НАД местностью и ПОД всем, что на клетке стоит.
 *
 * Глухого тумана здесь НЕТ нарочно: купол лежит поверх содержимого и рисуется
 * отдельным проходом (drawVoidDome.ts) — местность и всё, что на ней стоит,
 * админ видит ровно так же, как без купола.
 */
export function drawCells(scene: DrawScene, index: MapIndex): void {
  const { g, seen, visible, revealAll, covered } = scene;
  const hex = hexPath2D();
  // Пустые карты игроков/кораблей — не дёргаем Map.get на каждую клетку.
  const hasPlayers = scene.players.size > 0;
  const hasShips = scene.ships.size > 0;
  // Стрелки беглецов почти всегда пусты — не заходим в drawRunnerArrow зря.
  const hasRunners = !!scene.runnerArrows && Object.keys(scene.runnerArrows).length > 0;
  // Сундуки игроков редки — пустой словарь не трогаем на каждой клетке.
  const chests = scene.magicChests;
  const hasChests = !!chests && Object.keys(chests).length > 0;
  // Ямки от лопаты (02.10) — редки, пустой набор на клетках не трогаем.
  const holes = scene.digHoles?.size ? scene.digHoles : null;

  // Зоны тумана — номерами клеток, посчитаны в BetaRaidCanvas (fogZones).
  const activeZone = scene.fogZones?.active ?? EMPTY_IDX;
  const brightZone = scene.fogZones?.bright ?? EMPTY_IDX;
  // Объединённые блоки: картинка постройки рисуется один раз — на якоре кадра.
  // Якорь — последний разведанный член в кадре; картинка кладётся на нём до
  // корабля/лагеря самой клетки, а объекты остальных членов — поверх неё.
  const store = index.store;
  const blocks = blocksOf(store);
  const canAnchor = makeCanAnchor(scene);
  const plan = blocks.list.length
    ? planBlocks(blocks, index, scene.view, canAnchor)
    : { anchors: new Map<number, Block>(), offscreen: [] as Block[] };
  // Объекты/лагеря членов, нарисованных ДО якоря, — поверх картинки блока.
  const anchored = new Set(plan.anchors.values());
  const deferred = new Map<Block, Deferred[]>();
  const drawnBlocks = new Set<Block>();

  // Один проход: местность + содержимое клетки. Terrain и content рисуются
  // последовательно ВНУТРИ одной клетки — лента всегда поверх своей обводки,
  // а нижний сосед рисуется позже (y-order).
  forEachVisible(index, scene.view, (c) => {
    frameStats.cells++;
    const isVisible = revealAll || visible.has(c.i);
    const isSeen = isVisible || seen.hasIndex(c.i);
    // В тёмном тумане (tier 4) — не рисуем других игроков.
    const inDarkFog =
      !revealAll && isSeen && !isVisible && !activeZone.has(c.i) && !brightZone.has(c.i);
    // Местность, дорога и декор этой клетки уже лежат в куске статичного слоя
    // (drawStatic рисует и не испечённые — в холст под обрезкой) — по клеткам
    // рисуем их, только когда слоя нет вовсе (экран больше потолка памяти).
    const baked = covered.has(chunkId(chunkX(c.x), chunkY(c.y)));

    // === Terrain ===
    if (!isSeen) {
      if (!baked) {
        g.translate(c.x, c.y);
        g.fillStyle = COLOR.fogTile;
        g.fill(hex);
        g.translate(-c.x, -c.y);
      }
      return;
    }
    if (!baked) drawGround(scene, c, hex);
    // Ямка — на земле, под всем, что стоит на клетке, и под плёнкой тумана.
    if (holes?.has(c.key)) drawDigHole(scene, c);

    // На клетке стоят игроки — вместо объекта и декора показываем лагерь,
    // иначе картинки наложились бы друг на друга.
    // В тёмном тумане других игроков не показываем.
    const crowd = hasPlayers && !inDarkFog ? scene.players.get(c.key) : undefined;
    const isHero = !!scene.heroCell && scene.heroCell.q === c.q && scene.heroCell.r === c.r;
    // Член блока до его якоря: содержимое откладываем под картинку блока.
    const blockAt = blocks.groupOf[c.i] ?? -1;
    const block = blockAt >= 0 ? blocks.list[blockAt] : null;
    const anchorHere = !!block && plan.anchors.get(c.i) === block;
    if (
      block &&
      !anchorHere &&
      anchored.has(block) &&
      !drawnBlocks.has(block) &&
      !(hasShips && scene.ships.has(c.key))
    ) {
      let list = deferred.get(block);
      if (!list) {
        list = [];
        deferred.set(block, list);
      }
      list.push({ i: c.i, crowd, inDarkFog });
      return;
    }
    // Якорь блока: картинка блока ложится ДО корабля и лагеря этой клетки —
    // они рисуются поверх неё, как отложенное у остальных членов.
    let buildingTop: number | null = null;
    if (anchorHere) {
      buildingTop = drawBlock(scene, store, block);
      drawnBlocks.add(block);
      const list = deferred.get(block);
      if (list) drawDeferred(scene, store, list, hasRunners, buildingTop != null);
    }
    // Корабль сам показывает, занят он и кем, — лагерь поверх него не нужен.
    const ship = hasShips ? scene.ships.get(c.key) : undefined;
    if (ship) {
      drawShip(scene, c, ship);
      // На борту всегда один; счёт рисуем, если рядом с судном кто-то стоит.
      if (crowd) drawPlayerCount(scene, c, crowd);
      return;
    }
    // Лагерь замещает объект и декор, но НЕ постройку: строение важнее — по
    // нему игроки находят шахту, лавку, портал. На клетке со строением от
    // лагеря остаётся флажок сбоку и счётчик. Сундук держится так же.
    const chest = hasChests ? chests?.[c.key] : undefined;
    // Якорь блока-постройки без своей постройки на клетке — всё равно постройка.
    const onBuilding = !!c.cell.buildingId || (anchorHere && buildingTop != null);
    if (crowd && !isHero && !onBuilding && !chest) {
      drawPlayerCamp(scene, c, crowd);
      return;
    }
    // Одиночная клетка рисует свою постройку; член блока — нет (она на якоре).
    if (!block) {
      buildingTop = c.cell.buildingId ? drawBuilding(scene, c, c.cell.buildingId) : null;
    }
    // Сундук — поверх клетки, как постройка; охранника на клетке с постройкой
    // уже нарисовал drawBuilding (он берёт охрану по ключу клетки).
    if (chest) {
      const top = drawMagicChest(scene, c, chest, !c.cell.buildingId);
      if (buildingTop == null) buildingTop = top;
    }
    if (buildingTop != null && crowd && !isHero) {
      drawCampFlag(scene, c, buildingTop, R * 1.7);
    }
    // Декор лежит в испечённом куске; по клеткам — где куска нет, и ещё раз
    // поверх того, что стоит выше (decorFront): передний декор закрывает задних.
    // Декор члена блока рисует drawBlock одной картинкой — тут не дублируем.
    if (c.cell.decorationId && !block && (!baked || hasContentAbove(scene, store, c.q, c.r)))
      drawDecoration(scene, c, c.cell.decorationId);
    if (c.cell.objectId) drawObject(scene, c, c.cell, inDarkFog);
    // Красная стрелка «куда убежал беглец» — ПОВЕРХ содержимого клетки, чтобы
    // отметить спрятавшегося за объектом и показать направление побега.
    if (hasRunners) drawRunnerArrow(scene, c);
    // Свою клетку рисуем как есть; счёт показываем, только если на ней стоит
    // кто-то ещё (себя сервер в этот список не кладёт).
    if (crowd && (isHero || onBuilding || chest)) drawPlayerCount(scene, c, crowd);
  });

  // Блоки, чьи клетки все за кадром, а картинка ещё видна: под ними пусто.
  for (const b of plan.offscreen) drawBlock(scene, store, b);

  // Третий проход — туман. Сетка гексов убрана (не нужна при текущем зуме).

  // Проход ТРЕТИЙ — серая плёнка тумана на разведанных клетках вне обзора.
  // Рисуем ПОВЕРХ всего содержимого: объекты, постройки и декор видны, но
  // приглушены.
  //
  // Зоны тумана (уже посчитаны в начале функции):
  //  1. visible (радиус 2 от героя) — без плёнки (проход 1).
  //  2. brightZone (свои шахты и поля, где батрачит мой герой; радиус 1) — без плёнки.
  //     Чужие поля и склады плёнку получают — их бейджи читаются и под ней.
  //  3. activeZone (радиус 20 от героя) — лёгкий туман.
  //  4. seen, но вне activeZone — тёмный туман.
  //  5. !seen — чёрный (проход 1, COLOR.fogTile).
  if (!revealAll) {
    // Один fill на весь туман вместо fill на каждый гекс:
    // GPU рисует единую фигуру — быстрее тысяч отдельных вызовов.
    const fogLight = new Path2D();
    const fogDark = new Path2D();
    const hexTemplate = hexPath2D();
    const m = new DOMMatrix();
    const store = index.store;
    const p = store.packed;
    forEachVisible(index, scene.view, (c) => {
      if (visible.has(c.i) || brightZone.has(c.i)) return;
      if (!seen.hasIndex(c.i)) {
        // Неразведанная клетка на границе с разведанной: сюда «свисают»
        // картинки соседей (дерево вверх, постройка вширь). Без плёнки эта
        // часть картинки оставалась яркой, и объект «светился по контуру»
        // неразведанной области. Плёнка та же, что у соседа: чёрное под ней
        // не меняется, свес приглушается вместе с картинкой.
        if (!touchesSeen(store, seen, p.q[c.i], p.r[c.i])) return;
      }
      const target = activeZone.has(c.i) ? fogLight : fogDark;
      m.e = c.x;
      m.f = c.y;
      target.addPath(hexTemplate, m);
    });
    g.fillStyle = FOG_LIGHT;
    g.fill(fogLight);
    g.fillStyle = FOG_DARK;
    g.fill(fogDark);
  }
}
