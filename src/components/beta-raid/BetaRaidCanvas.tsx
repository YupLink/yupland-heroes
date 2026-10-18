// Canvas бета-рейда: рендер карты, пан/зум, клики.
// Тяжёлая часть (кадры, камера, герой) живёт в useMapRenderer — здесь только
// сборка сцены, жесты и слои поверх карты.
import { useEffect, useRef, useCallback, useMemo, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { useLang, tFor } from "@/lib/i18n";
import { useRaidCastle } from "./useRaidCastle";
import { cellAtPoint } from "./canvasHitTest";
import type { FlashMark } from "./drawFlash";
import { buildMapIndex } from "./mapIndex";
import { useFogView } from "./useFogView";
import { useCanvasViewport } from "./useCanvasViewport";
import { useImageCache } from "./useImageCache";
import { useMapRenderer } from "./useMapRenderer";
import { useFleeArrows } from "./useFleeArrows";
import { subscribeCenter } from "./centerMapBus";
import { IslandLayer } from "./island/IslandLayer";
import { BetaRaidHud } from "./BetaRaidHud";
import { BetaEffectHud } from "./BetaEffectHud";
import { useCastleMode } from "./castleMode";
import { BetaRaidPathBadge } from "./BetaRaidPathBadge";
import { usePathBadgeTarget } from "./usePathBadgeTarget";
import { BetaRaidResourceBar } from "./BetaRaidResourceBar";
import type { CanvasProps } from "./betaCanvasProps";
import { buildObjectRings } from "./objectRing";
import { buildFogZones } from "./fogZones";
import { objectKindsOf } from "./objectKind";
export function BetaRaidCanvas({
  onOpenGiftPack,
  map,
  store,
  cells,
  terrains,
  voidCells,
  objects,
  decorations,
  roads,
  buildings,
  buildingTiers,
  mineFlags,
  mineGuards,
  magicChests,
  lootBags,
  ground,
  fieldSlots,
  warehouseBadges,
  playerPos,
  chipEffects,
  weakenEffects,
  buffEffects,
  slow,
  availableMoves,
  energy,
  onCellClick,
  walking,
  onStop,
  heroSprite,
  heroAvatarUrl,
  onPickHero,
  hero,
  ships,
  pendingCells,
  selectedForGen,
  mergeSel,
  pendingPath,
  pendingAction,
  doorTolls,
  onConfirmPath,
  onCancelPath,
  isAdmin,
  editActive,
  fullscreen,
  onToggleFullscreen,
  castleCell,
}: CanvasProps) {
  // Бейджу маршрута: итоговая клетка, цена, шаги и плата за ворота — из пути
  // (usePathBadgeTarget). Язык, а не `t`: ссылка на объект дёргала бы
  // перерисовку кадра.
  const castleMode = useCastleMode();
  const lang = useLang();
  const pendingPathTarget = usePathBadgeTarget(
    { pendingPath, pendingAction, cells, buildings, buildingTiers, doorTolls },
    lang,
  );
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const badgeRef = useRef<HTMLDivElement | null>(null);

  // Кадр просит перерисовку через ref: камера создаётся раньше рендерера,
  // но дёргать его нужно уже ей (жесты) — ref разрывает этот круг.
  const redrawRef = useRef<() => void>(() => {});
  const requestRedraw = useCallback(() => redrawRef.current(), []);

  // Красная стрелка «куда убежал беглец» — вспышка на 0.8с, по клеткам пути
  // (useFleeArrows: побег на две — двумя отрезками, не прямой через скалу).
  const fleeArrows = useFleeArrows(requestRedraw);

  const imgCache = useImageCache(
    terrains,
    objects,
    decorations,
    roads,
    requestRedraw,
    heroSprite,
    buildings,
    mineGuards,
    magicChests,
  );

  // Ободки объектов — раз на словарь, а не на кадр: редкость не меняется.
  const objectRings = useMemo(() => buildObjectRings(objects), [objects]);

  // Кэш типов объектов — раз на словарь.
  const objectKinds = useMemo(() => objectKindsOf(objects), [objects]);

  // Зоны тумана номерами клеток — кэшируются, чтобы не пересчитывать каждый
  // кадр. Только герой и mineFlags 'own': fieldSlots и warehouseBadges зоны
  // НЕ дают (см. fogZones.ts) — чужие поля и соседи складов стояли без плёнки.
  const heroQ0 = playerPos?.q ?? null;
  const heroR0 = playerPos?.r ?? null;
  // Мои бугорки строкой: слой мешочков перечитывается часто, а зоны тумана
  // пересчитываем, только когда сменился сам набор бугорков.
  const moundsKey = ground?.mounds.join(";") ?? "";
  const fogZones = useMemo(
    () =>
      buildFogZones({
        index: (q, r) => store.index(q, r),
        heroQ: heroQ0,
        heroR: heroR0,
        mineFlags,
        mounds: moundsKey ? moundsKey.split(";") : [],
      }),
    [heroQ0, heroR0, mineFlags, moundsKey, store],
  );

  // Точка отсчёта гекс-сетки — один раз, уходит в memo-пропсы HUD.
  const grid = useMemo(() => {
    const c0q = Math.floor(map.size / 2);
    return { c0q, centerQ: c0q - Math.floor((c0q - (c0q & 1)) / 2) };
  }, [map.size]);
  const { castle, castleShown, castleArt } = useRaidCastle(map, store, castleCell);

  // Кадр ходит по колонкам и сетке карты (mapIndex поверх mapStore).
  const overviewLandscape = useMemo(() => ({ cells, terrains }), [cells, terrains]);
  const index = useMemo(() => buildMapIndex(store), [store]);

  // Радиус обзора один на всех (VISION_RADIUS).
  const fog = useFogView({ mapId: map.id, playerPos, store, voidCells, editActive: !!editActive });
  const [externalTarget, setExternalTarget] = useState<{ q: number; r: number; mapId: string } | null>(null);
  const targetOnMap = externalTarget?.mapId === map.id ? externalTarget : null;
  // Навигация к своему сундуку не должна обрезаться временными границами
  // тумана, пока разведанное ещё загружается. Сам туман этим не раскрывается.
  const cameraBounds = useMemo(() => {
    if (!targetOnMap) return fog.bounds;
    const b = fog.bounds;
    const pad = 5;
    return {
      minQ: Math.min(b?.minQ ?? targetOnMap.q - pad, targetOnMap.q - pad),
      maxQ: Math.max(b?.maxQ ?? targetOnMap.q + pad, targetOnMap.q + pad),
      minR: Math.min(b?.minR ?? targetOnMap.r - pad, targetOnMap.r - pad),
      maxR: Math.max(b?.maxR ?? targetOnMap.r + pad, targetOnMap.r + pad),
    };
  }, [fog.bounds, targetOnMap]);
  const {
    offsetRef,
    scaleRef,
    stepCamera,
    zoomBy,
    centerOn,
    setFollowTarget,
    stopFollow,
    parked,
    park,
    unpark,
    reclamp,
    dragMoved,
    handlers,
  } = useCanvasViewport(map.size, cameraBounds, requestRedraw, wrapRef);

  // Клетка, подсвеченная из списка «Добыча»: ref, а не состояние — метку
  // читает цикл кадров, и лишняя перерисовка React'а тут ни к чему.
  const flashRef = useRef<FlashMark | null>(null);

  const renderer = useMapRenderer({
    canvasRef,
    wrapRef,
    badgeRef,
    index,
    mapId: map.id,
    buildingTiers: buildingTiers ?? {},
    mineFlags,
    mineGuards,
    magicChests,
    lootBags,
    ground,
    fieldSlots,
    warehouseBadges,
    runnerArrows: fleeArrows,
    images: imgCache,
    objectRings,
    objects,
    objectKinds,
    fogZones,
    seen: fog.seen,
    visible: fog.visibleIdx,
    // В режиме бога карту показываем целиком: иначе только что залитую в туман
    // территорию не видно (drawCells рисует туман и пропускает содержимое).
    revealAll: fog.revealAll || !!editActive,
    voidCells: fog.voidCells,
    centerQ: grid.centerQ,
    c0q: grid.c0q,
    castle,
    castleShown: castleArt,
    playerPos,
    availableMoves,
    pendingPathTarget,
    pendingPath,
    ships,
    pendingCells,
    selectedForGen,
    mergeSel,
    flashRef,
    offsetRef,
    scaleRef,
    stepCamera,
  });
  redrawRef.current = renderer.requestRedraw;
  // Сундук поставили или разграбили, мешочек выпал или ушёл — кадр сразу.
  useEffect(() => requestRedraw(), [magicChests, lootBags, ground, requestRedraw]);

  /**
   * Показать клетку: везём камеру и зажигаем метку. Зовут из окна «Добыча» —
   * там координаты кликабельны, и игроку надо не просто доехать, а увидеть,
   * КУДА он доехал.
   */
  const showCell = useCallback(
    (q: number, r: number) => {
      setExternalTarget(null);
      park();
      centerOn(q, r, false);
      flashRef.current = { q, r, start: performance.now() };
      requestRedraw();
    },
    [centerOn, park, requestRedraw],
  );

  /** Явный прицел (замок, миникарта): камера стоит там, пока герой не пойдёт новым маршрутом. */
  const lookAt = useCallback(
    (q: number, r: number) => {
      setExternalTarget(null);
      park();
      centerOn(q, r, false);
    },
    [centerOn, park],
  );

  /** «К герою»: снять парковку и снова идти за фигуркой. */
  const goToHero = useCallback(
    (q: number, r: number) => {
      setExternalTarget(null);
      unpark();
      centerOn(q, r, false);
      setFollowTarget(q, r);
    },
    [centerOn, setFollowTarget, unpark],
  );

  // Новый маршрут — игрок снова смотрит на героя: парковка снимается.
  useEffect(() => {
    if (walking) {
      setExternalTarget(null);
      unpark();
    }
  }, [walking, unpark]);

  // Внешний зов — из окна «Экономика» и любого другого места, куда пропсы
  // тянуть не хочется. TTL идёт в саму метку: 3 000 мс просит экономика,
  // встроенные вызовы (Добыча) не задают и получают дефолт drawFlash.
  useEffect(
    () =>
      subscribeCenter(({ q, r, ttlMs }) => {
        setExternalTarget({ q, r, mapId: map.id });
        park();
        centerOn(q, r, false);
        flashRef.current = { q, r, start: performance.now(), ttl: ttlMs };
        requestRedraw();
      }),
    [centerOn, map.id, park, requestRedraw],
  );

  // При первом открытии мира границы тумана ещё могут содержать только героя.
  // centerOn тогда ограничит цель этой областью. После загрузки разведанного
  // повторяем явный переход, не возвращая камеру к герою.
  useEffect(() => {
    const target = targetOnMap;
    if (!target || target.mapId !== map.id || !parked.current) return;
    centerOn(target.q, target.r, false);
    requestRedraw();
  }, [cameraBounds, targetOnMap, map.id, centerOn, parked, requestRedraw]);

  // Размер холста: канвас читает его прямо в кадре, нам нужен лишь сигнал.
  // Debounce 100мс: при drag-resize observer стреляет на каждый пиксель сдвига;
  // reclamp + redraw на каждый — трата CPU. Fullscreen-toggle одиночный, debounce
  // его не задержит (одно событие = один таймер).
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const ro = new ResizeObserver(() => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        reclamp();
        requestRedraw();
        resizeTimer = null;
      }, 100);
    });
    ro.observe(wrap);
    requestRedraw();
    return () => {
      ro.disconnect();
      if (resizeTimer) clearTimeout(resizeTimer);
    };
  }, [requestRedraw, reclamp]);

  // Первое появление героя — камеру сразу, без проезда. Координаты числами:
  // объект playerPos приходит новым на каждый ответ, камера дёргалась бы.
  const centered = useRef("");
  const prevHero = useRef<{ q: number; r: number } | null>(null);
  const heroQ = playerPos?.q ?? null;
  const heroR = playerPos?.r ?? null;
  useEffect(() => {
    if (heroQ == null || heroR == null) return;
    // Первое появление на карте — мгновенно.
    if (centered.current !== map.id) {
      const firstMap = centered.current === "";
      centered.current = map.id;
      // Preserve an explicit target on first load, but reset for a different map.
      if (!firstMap || !parked.current) centerOn(heroQ, heroR, true);
      prevHero.current = { q: heroQ, r: heroR };
      return;
    }
    // Портал / рывок: герой прыгнул дальше 5 клеток — центрируем сразу
    // (плавно, centerOn false) и выключаем follow, чтобы он не перебивал.
    const prev = prevHero.current;
    const jumped = prev && Math.abs(heroQ - prev.q) + Math.abs(heroR - prev.r) > 5;
    prevHero.current = { q: heroQ, r: heroR };
    if (jumped) {
      if (targetOnMap && parked.current) return;
      unpark();
      stopFollow();
      centerOn(heroQ, heroR, false);
      return;
    }
    // Камера припаркована явным прицелом — шаг её не возвращает.
    if (parked.current) return;
    // Обычный шаг — включаем follow, stepCamera сам тянет камеру каждый кадр.
    setFollowTarget(heroQ, heroR);
  }, [map.id, heroQ, heroR, centerOn, setFollowTarget, stopFollow, parked, unpark, targetOnMap]);

  // Колесо вешаем сами: React слушает wheel пассивно, preventDefault не работает.
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomBy(e.deltaY > 0 ? 0.9 : 1.1);
    };
    cv.addEventListener("wheel", onWheel, { passive: false });
    return () => cv.removeEventListener("wheel", onWheel);
  }, [zoomBy]);

  // Клик
  const handleClick = (e: React.MouseEvent) => {
    if (dragMoved.current) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const { q, r } = cellAtPoint({
      clientX: e.clientX,
      clientY: e.clientY,
      rect,
      offset: offsetRef.current,
      scale: scaleRef.current,
      centerQ: grid.centerQ,
      c0q: grid.c0q,
    });
    // В туман не ходим вслепую (в режиме раскрытия его для админа нет). В режиме
    // бога тап по туману РАЗРЕШЁН: иначе кистью не налить территорию в пустоту
    // на краю карты — приходилось «прислоняться» к уже разведанному.
    if (
      !editActive &&
      !fog.revealAll &&
      !fog.seen.has(`${q},${r}`) &&
      !fog.visible.has(`${q},${r}`)
    )
      return;
    onCellClick(q, r);
  };

  return (
    <div
      ref={wrapRef}
      className={
        fullscreen
          ? "fixed inset-0 z-50 select-none bg-black"
          : // vh, а не dvh: на телефоне адресная строка прячется при прокрутке,
            // dvh меняется вместе с ней — карта пересобиралась бы и камера
            // дёргалась на каждый скролл. Прибавка +48px от Ангелины сохранена.
            "relative h-[calc(50vh+48px)] select-none overflow-hidden rounded-xl border border-border"
      }
      style={{ touchAction: "none" }}
    >
      <canvas
        ref={canvasRef}
        className="block h-full w-full cursor-grab active:cursor-grabbing"
        onPointerDown={(e) => { setExternalTarget(null); handlers.onPointerDown(e); }}
        onPointerMove={handlers.onPointerMove}
        onPointerUp={handlers.onPointerUp}
        onPointerCancel={handlers.onPointerUp}
        onTouchStart={(e) => { setExternalTarget(null); handlers.onTouchStart(e); }}
        onTouchMove={handlers.onTouchMove}
        onTouchEnd={handlers.onTouchEnd}
        onTouchCancel={handlers.onTouchEnd}
        onClick={handleClick}
      />

      <BetaRaidHud
        onOpenGiftPack={onOpenGiftPack}
        seen={fog.overview}
        landscape={overviewLandscape}
        playerQ={playerPos?.q ?? null}
        playerR={playerPos?.r ?? null}
        castle={castle}
        castleShown={castleShown}
        centerQ={grid.centerQ}
        c0q={grid.c0q}
        walking={walking}
        onStop={onStop}
        onCenter={goToHero}
        onLook={lookAt}
        onShowCell={showCell}
        heroAvatarUrl={heroAvatarUrl}
        heroSprite={heroSprite}
        onPickHero={onPickHero}
        hero={hero}
      />
      <IslandLayer mapId={map.id} />
      {!castleMode && <BetaEffectHud
        chips={chipEffects ?? []}
        slow={slow ?? null}
        weaken={weakenEffects ?? []}
        buff={buffEffects ?? []}
      />}
      {pendingPathTarget && (
        <BetaRaidPathBadge
          hostRef={badgeRef}
          target={pendingPathTarget}
          energy={energy}
          onConfirm={onConfirmPath}
          onCancel={onCancelPath}
        />
      )}
      <BetaRaidResourceBar energy={energy} isAdmin={isAdmin} />
      {/* Кнопка не админская: карту на весь экран открывает игрок, а не
          редактор карт. Раньше гейт по isAdmin прятал её от всех остальных. */}
      {onToggleFullscreen && (
        <button
          type="button"
          onClick={onToggleFullscreen}
          className="pointer-events-auto absolute bottom-12 right-[132px] z-30 flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black/70 text-white/70 backdrop-blur-sm transition hover:text-white sm:bottom-2"
          title={tFor(lang, fullscreen ? "braid.fullscreen_exit" : "braid.fullscreen_enter")}
        >
          {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
      )}
    </div>
  );
}

