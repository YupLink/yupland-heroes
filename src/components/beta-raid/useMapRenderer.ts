import { WaterRipples } from "./waterRipples";
import { COVERED_DELAY_MS, mapCovered } from "./mapCovered";
// Цикл кадров карты: рисует сцену, ведёт героя между клетками и держит
// метку маршрута на своём месте.
//
// React в этом цикле не участвует: камера и герой живут в ref'ах, кадр берёт
// их напрямую. Цикл сам засыпает, когда движение закончилось, и просыпается
// по requestRedraw() — от жеста, шага героя или загрузившейся картинки.
import { useCallback, useEffect, useRef } from "react";
import { enchanterFrameDelay, subscribeEnchanterPreferences } from "./mapEnchanter";
import { campOnlineDelay } from "./campOnline";
import { R, axialToPixel } from "./hexGeometry";
import { placeBadge } from "./placeBadge";
import { HexTileCache } from "./hexTileCache";
import { RoadRibbonCache } from "./roadRibbonCache";
import { ChunkLayer } from "./chunkLayer";
import { SpriteCache } from "./spriteCache";
import { drawFrame, type HeroVisual, type RendererInput } from "./drawFrame";
import { flashAlive } from "./drawFlash";
import { frameStats } from "./frameStats";
import { probeFrame } from "@/lib/perf/clientProbe";
import { noteMapFrame, noteMapMount } from "@/components/game/settleSignals";
import { cancelHeroAction, fishingIdleDelay, heroActionActive, heroActionShouldCancelForTrip, subscribeHeroAction } from "./heroActionVisual";
import { placeMineBuildUi } from "./mine-build/placeMineBuildUi";
import { mapFramesHeld, subscribeMapHold } from "./mapFrameHold";
import { useRedrawOnStores } from "./useRedrawOnStores";
import { heroStepMs, heroRouteActive, subscribeHeroRoute } from "./heroPace";

import { sampleHeroTrip, keepHeroGallop } from "./heroMotionContinuity";

export type { RendererInput } from "./drawFrame";

// Сколько едет герой между клетками — темп его коня (heroPace, §8.84).

export function useMapRenderer(input: RendererInput, artRevision?: string) {
  const ref = useRef(input);
  ref.current = input;

  const dirty = useRef(true);
  const raf = useRef<number | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tiles = useRef(new HexTileCache());
  const ribbons = useRef(new RoadRibbonCache());
  const chunks = useRef(new ChunkLayer());
  const sprites = useRef(new SpriteCache());
  const water = useRef(new WaterRipples());
  // Герой: где он сейчас (в пикселях) и куда едет.
  const hero = useRef<{ x: number; y: number } | null>(null);
  const lastMovingFrame = useRef<number | null>(null);
  const facing = useRef({ up: false, left: false });
  const trip = useRef<{
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    start: number;
  } | null>(null);

  const frame = useCallback((now: number) => {
    // Окно «Карта» поверх: кадр стоит, просьбы копятся в dirty (mapFrameHold).
    if (mapFramesHeld() || document.hidden) {
      ref.current.onHeroMotion?.(false);
      raf.current = null;
      return;
    }
    const moving = ref.current.stepCamera();
    const activeTrip = trip.current;
    const walking = stepHero(hero, trip, now);
    if (walking) lastMovingFrame.current = now;
    const galloping = walking || keepHeroGallop(now, lastMovingFrame.current, heroRouteActive());
    if (!galloping && lastMovingFrame.current !== null) {
      dirty.current = true; // Draw the real stop after the short bridge expires.
      lastMovingFrame.current = null;
    }
    if (walking && activeTrip && heroActionShouldCancelForTrip(activeTrip.start)) cancelHeroAction();
    ref.current.onHeroMotion?.(walking && !!activeTrip
      && Math.hypot(activeTrip.toX - activeTrip.fromX, activeTrip.toY - activeTrip.fromY) > .5);
    const runAtlas = ref.current.images.current?.get("hero:gallop");
    const footRun = runAtlas?.complete && runAtlas.naturalWidth === 1024 && runAtlas.naturalHeight === 384;
    const heroVisual: HeroVisual = {
      ...facing.current,
      // Новый пеший атлас: 8 цельных поз по 60 мс. У коней 3 кадра по 100 мс, независимо от скорости переходов.
      // Часы общие для маршрута: на границе соты цикл не начинается заново.
      // Загруженный размер также сохраняет старый цикл при fallback/старом PNG.
      phase: galloping
        ? Math.floor(now / (footRun ? 60 : (ref.current.heroMount === "none" ? 50 : 100))) % (footRun ? 8 : 3)
        : null,
    };
    // Двухклеточный шаг пегаса приподнимаем по дуге; маршрут и цену шага
    // уже проверили игровые правила, здесь меняется только картинка.
    const jump = walking && activeTrip && ref.current.heroMount === "unique"
      && Math.hypot(activeTrip.toX - activeTrip.fromX, activeTrip.toY - activeTrip.fromY) > R * 2.5;
    const heroInFrame = hero.current && jump
      ? { ...hero.current, y: hero.current.y - Math.sin(Math.PI * Math.min(1, (now - activeTrip.start) / heroStepMs())) * R * 0.9 }
      : hero.current;
    // Пока горит метка клетки, кадры нужны каждый раз: она гаснет плавно.
    const flashing = flashAlive(ref.current.flashRef?.current ?? null, now);
    // После последнего шага обязательно рисуем покой: stepHero уже очистил trip.
    if (dirty.current || moving || walking || galloping || activeTrip || flashing || heroActionActive()) {
      // moving пробрасываем в кадр: пока камера едет — рисуем облегчённо
      // (без «серой плёнки тумана» на клетках).
      const t0 = performance.now();
      const more = drawFrame(
        ref.current,
        tiles.current,
        ribbons.current,
        chunks.current,
        sprites.current,
        heroInFrame,
        heroVisual,
        moving,
        water.current,
      );
      // Проба нагрузки: сколько занял кадр и сколько клеток в нём было.
      probeFrame(performance.now() - t0, moving || walking, frameStats.cells);
      placeBadge(ref.current);
      placeMineBuildUi(ref.current);
      // Статичный слой печётся порциями: не допекли — следующий кадр допечёт.
      dirty.current = more;
      noteMapFrame(more);
      if (idleTimer.current) clearTimeout(idleTimer.current);
      // Рыбалка, шаман, лагеря онлайн — кому нужен следующий кадр без движения.
      const delays = [fishingIdleDelay(Date.now()), enchanterFrameDelay(), campOnlineDelay(), water.current.delay()]
        .filter((d): d is number => d !== null);
      // Под окном (mapCovered) анимациям хватит кадра в секунду.
      const delay = delays.length ? Math.max(Math.min(...delays), mapCovered() ? COVERED_DELAY_MS : 0) : null;
      idleTimer.current = delay === null ? null : setTimeout(() => {
        idleTimer.current = null;
        dirty.current = true;
        if (raf.current == null && !mapFramesHeld() && !document.hidden) raf.current = requestAnimationFrame(frame);
      }, delay);
      raf.current = requestAnimationFrame(frame);
      return;
    }
    raf.current = null;
  }, []);

  const requestRedraw = useCallback(() => {
    water.current.invalidate();
    dirty.current = true;
    if (raf.current == null && !mapFramesHeld() && !document.hidden) raf.current = requestAnimationFrame(frame);
  }, [frame]);

  useEffect(() => {
    noteMapMount(); // «дорисована ли» считаем для этой карты заново
    return () => {
      if (raf.current != null) cancelAnimationFrame(raf.current);
      if (idleTimer.current) clearTimeout(idleTimer.current);
      ref.current.onHeroMotion?.(false);
      raf.current = null;
    };
  }, []);

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const visibility = () => {
      if (document.hidden) {
        if (raf.current != null) cancelAnimationFrame(raf.current);
        if (idleTimer.current) clearTimeout(idleTimer.current);
        raf.current = null; idleTimer.current = null;
        ref.current.onHeroMotion?.(false);
      } else requestRedraw();
    };
    document.addEventListener('visibilitychange', visibility);
    motion.addEventListener('change', requestRedraw);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      motion.removeEventListener('change', requestRedraw);
      water.current.clear();
    };
  }, [requestRedraw]);

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
    // Sample the outgoing segment at this exact timestamp, not its last RAF.
    // Otherwise every cell can shorten the previous segment by one frame.
    if (t) stepHero(hero, trip, performance.now());
    const from = hero.current;
    const far = !from || Math.hypot(to.x - from.x, to.y - from.y) > R * 4;
    if (far) {
      hero.current = to;
      trip.current = null;
    } else {
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      if (Math.abs(dx) > 0.5) facing.current.left = dx < 0;
      if (Math.abs(dy) > 0.5) facing.current.up = dy < 0;
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
    input.waterTerrainIds,
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
    // Тир постройки (починил портал, улучшил здание): правка только тира
    // клетки не меняет, индекс прежний — без этого облик менялся только со следующего жеста.
    input.buildingTiers,
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

  // Окно «Карта» открыли — куски статики отпускаем (память графики), закрыли —
  // кадр заново: недостающие куски кадр дорисует по клеткам и допечёт.
  useEffect(
    () => subscribeMapHold((held) => {
      if (held) { chunks.current.clear(); water.current.clear(); }
      else requestRedraw();
    }),
    [requestRedraw],
  );
  useEffect(() => subscribeEnchanterPreferences(requestRedraw), [requestRedraw]);
  // Чужой шаг — один кадр, без React: точки игроков живут мимо пропсов.
  useEffect(() => subscribeHeroRoute(requestRedraw), [requestRedraw]);
  useEffect(() => subscribeHeroAction(requestRedraw), [requestRedraw]);
  useRedrawOnStores(requestRedraw);

  useEffect(()=>{
    const snowChanged=tiles.current.setSnow(input.snowStage??0,input.snowTerrainKeys);
    const puddlesChanged=tiles.current.setPuddles(input.puddles===true,input.snowTerrainKeys);
    if(snowChanged||puddlesChanged){
      chunks.current.clear();
      requestRedraw();
    }
  },[input.snowStage,input.puddles,input.snowTerrainKeys,requestRedraw]);

  // Новая КАРТА — старые тайлы и ленты больше не годятся. Именно карта, а не
  // индекс клеток: тайл печётся из картинки местности и от того, что на клетке
  // стоит, не зависит вовсе. По индексу кэш сбрасывался на каждый мазок кистью
  // — и режим бога заново вырезал по гексу все картинки на каждое нажатие.
  useEffect(() => {
    tiles.current.clear();
    ribbons.current.clear();
    chunks.current.clear();
    sprites.current.clear();
    water.current.clear();
    requestRedraw();
  }, [input.mapId, artRevision, requestRedraw]);

  // Свои холсты ряби (MapWaterLayers): фаза идёт мимо кадра карты.
  const bindWater = useCallback((w: HTMLCanvasElement | null, t: HTMLCanvasElement | null) => {
    water.current.attach(w, t);
    requestRedraw();
  }, [requestRedraw]);

  return { requestRedraw, heroRef: hero, bindWater };
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
  const { progress: k, x, y } = sampleHeroTrip(t, now, heroStepMs());
  hero.current = { x, y };
  if (k >= 1) {
    trip.current = null;
    return false;
  }
  return true;
}
