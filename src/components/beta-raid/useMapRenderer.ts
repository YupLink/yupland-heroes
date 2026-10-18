// Цикл кадров карты: рисует сцену, ведёт героя между клетками и держит
// метку маршрута на своём месте.
//
// React в этом цикле не участвует: камера и герой живут в ref'ах, кадр берёт
// их напрямую. Цикл сам засыпает, когда движение закончилось, и просыпается
// по requestRedraw() — от жеста, шага героя или загрузившейся картинки.
import { useCallback, useEffect, useRef } from "react";
import { R, axialToPixel } from "./hexGeometry";
import { placeBadge } from "./placeBadge";
import { HexTileCache } from "./hexTileCache";
import { RoadRibbonCache } from "./roadRibbonCache";
import { ChunkLayer } from "./chunkLayer";
import { SpriteCache } from "./spriteCache";
import { drawFrame, type RendererInput } from "./drawFrame";
import { flashAlive } from "./drawFlash";
import { frameStats } from "./frameStats";
import { probeFrame } from "@/lib/perf/clientProbe";
import { noteMapFrame, noteMapMount } from "@/components/game/settleSignals";
import { subscribePlayerDots } from "./playerDots";
import { subscribeIslandGoal } from "./island/islandGoal";

export type { RendererInput } from "./drawFrame";

/** Сколько едет герой между соседними клетками. */
const STEP_MS = 190;
const easeOut = (t: number) => 1 - (1 - t) * (1 - t);

export function useMapRenderer(input: RendererInput) {
  const ref = useRef(input);
  ref.current = input;

  const dirty = useRef(true);
  const raf = useRef<number | null>(null);
  const tiles = useRef(new HexTileCache());
  const ribbons = useRef(new RoadRibbonCache());
  const chunks = useRef(new ChunkLayer());
  const sprites = useRef(new SpriteCache());
  // Герой: где он сейчас (в пикселях) и куда едет.
  const hero = useRef<{ x: number; y: number } | null>(null);
  const trip = useRef<{
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    start: number;
  } | null>(null);

  const frame = useCallback((now: number) => {
    const moving = ref.current.stepCamera();
    const walking = stepHero(hero, trip, now);
    // Пока горит метка клетки, кадры нужны каждый раз: она гаснет плавно.
    const flashing = flashAlive(ref.current.flashRef?.current ?? null, now);
    if (dirty.current || moving || walking || flashing) {
      // moving пробрасываем в кадр: пока камера едет — рисуем облегчённо
      // (без «серой плёнки тумана» на клетках).
      const t0 = performance.now();
      const more = drawFrame(
        ref.current,
        tiles.current,
        ribbons.current,
        chunks.current,
        sprites.current,
        hero.current,
        moving,
      );
      // Проба нагрузки: сколько занял кадр и сколько клеток в нём было.
      probeFrame(performance.now() - t0, moving || walking, frameStats.cells);
      placeBadge(ref.current);
      // Статичный слой печётся порциями: не допекли — следующий кадр допечёт.
      dirty.current = more;
      noteMapFrame(more);
      raf.current = requestAnimationFrame(frame);
      return;
    }
    raf.current = null;
  }, []);

  const requestRedraw = useCallback(() => {
    dirty.current = true;
    if (raf.current == null) raf.current = requestAnimationFrame(frame);
  }, [frame]);

  useEffect(() => {
    noteMapMount(); // «дорисована ли» считаем для этой карты заново
    return () => {
      if (raf.current != null) cancelAnimationFrame(raf.current);
      raf.current = null;
    };
  }, []);

  // Герой сменил клетку — едем туда плавно. Дальний прыжок (первый вход,
  // телепорт) ставим сразу: «полёт» через полкарты выглядел бы поломкой.
  //
  // Если анимация уже идёт И конечная точка совпадает — не трогаем trip:
  // повторный запуск брал hero.current (между клетками) как начало и создавал
  // короткий рывок назад, который игрок видел как «колбасит героя».
  useEffect(() => {
    const p = input.playerPos;
    if (!p) return;
    const to = axialToPixel(p.q, p.r, input.centerQ, input.c0q);
    const t = trip.current;
    if (t && Math.abs(t.toX - to.x) < 0.5 && Math.abs(t.toY - to.y) < 0.5) return;
    const from = hero.current;
    const far = !from || Math.hypot(to.x - from.x, to.y - from.y) > R * 4;
    if (far) {
      hero.current = to;
      trip.current = null;
    } else {
      trip.current = {
        fromX: from.x,
        fromY: from.y,
        toX: to.x,
        toY: to.y,
        start: performance.now(),
      };
    }
    requestRedraw();
  }, [input.playerPos?.q, input.playerPos?.r, input.centerQ, input.c0q, requestRedraw]);

  // Маршрут только что выбран — ставим метку на место сразу, не дожидаясь
  // кадра: вкладка может быть в фоне, и тогда rAF не придёт вовсе.
  useEffect(() => {
    placeBadge(ref.current);
  }, [input.pendingPathTarget]);

  // Данные карты/тумана/маршрута поменялись — перерисовать один кадр.
  useEffect(() => {
    requestRedraw();
  }, [
    input.index,
    input.seen,
    input.visible,
    // Тумблер «карта открыта целиком»: кадр обязан перерисоваться на нажатие.
    input.revealAll,
    // Зона непроходимого тумана: админ красит её кистью, и подсветка обязана
    // появиться в том же кадре, а не после следующего жеста.
    input.voidCells,
    input.availableMoves,
    input.pendingPathTarget,
    input.pendingPath,
    input.ships,
    // Бейджи складов: значок обязан перерисоваться на приход данных, а не на
    // следующий чужой шаг (flags/slots перерисовываются попутно с players).
    input.warehouseBadges,
    // Флажки: столб, забранный героем, помечается сразу после изучения, смены
    // героя или забвения — а не со следующим жестом или чужим шагом.
    input.mineFlags,
    // Накопленные правки админа рисуются рамкой — без этого кадр не обновлялся,
    // и обводка появлялась только после следующего жеста.
    input.pendingCells,
    // Выделение под биом-генератор — своя пунктирная рамка: без deps её видно
    // только со следующего движения камеры.
    input.selectedForGen,
    // Оверлей объединения: выделение обязано появиться в том же кадре.
    input.mergeSel,
    requestRedraw,
  ]);

  // Чужой шаг — один кадр, без React: точки игроков живут мимо пропсов.
  useEffect(() => subscribePlayerDots(requestRedraw), [requestRedraw]);
  // Цель шага острова сменилась — один кадр.
  useEffect(() => subscribeIslandGoal(requestRedraw), [requestRedraw]);

  // Новая КАРТА — старые тайлы и ленты больше не годятся. Именно карта, а не
  // индекс клеток: тайл печётся из картинки местности и от того, что на клетке
  // стоит, не зависит вовсе. По индексу кэш сбрасывался на каждый мазок кистью
  // — и режим бога заново вырезал по гексу все картинки на каждое нажатие.
  useEffect(() => {
    tiles.current.clear();
    ribbons.current.clear();
    chunks.current.clear();
    sprites.current.clear();
    requestRedraw();
  }, [input.mapId, requestRedraw]);

  return { requestRedraw };
}

/** Кадр движения героя. true — едет дальше. */
function stepHero(
  hero: React.RefObject<{ x: number; y: number } | null>,
  trip: React.RefObject<{
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    start: number;
  } | null>,
  now: number,
): boolean {
  const t = trip.current;
  if (!t) return false;
  const k = Math.min(1, (now - t.start) / STEP_MS);
  const e = easeOut(k);
  hero.current = { x: t.fromX + (t.toX - t.fromX) * e, y: t.fromY + (t.toY - t.fromY) * e };
  if (k >= 1) {
    trip.current = null;
    return false;
  }
  return true;
}
