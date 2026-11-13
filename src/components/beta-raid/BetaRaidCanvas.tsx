import { isWaterName } from "@/lib/shipRules";
import newspaperSprite from "../newspaper/newspaper-map.webp";
import { mountTier } from "@/lib/hero/mount";
import { useRaidMovementAudio } from "@/hooks/useRaidMovementAudio";
import { MapWaterLayers } from "./MapWaterLayers";
// Canvas бета-рейда: рендер карты, пан/зум, клики.
// Тяжёлая часть (кадры, камера, герой) живёт в useMapRenderer — здесь только
// сборка сцены, жесты и слои поверх карты.
import { useEffect, useRef, useCallback, useMemo, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { useLang, tFor } from "@/lib/i18n";
import { useRaidCastle } from "./useRaidCastle";
import { axialToPixel, hexRound, R, SQRT3 } from "./hexGeometry";
import { cellAtPoint } from "./canvasHitTest";
import type { FlashMark } from "./drawFlash";
import { buildMapIndex } from "./mapIndex";
import { useFogView } from "./useFogView";
import { useCanvasViewport } from "./useCanvasViewport";
import { useWorldArt } from "./world-art/useWorldArt";
import { worldTerrainArt } from "./world-art/worldArt";
import { useImageCache } from "./useImageCache";
import { useMapRenderer } from "./useMapRenderer";
import { useFleeArrows } from "./useFleeArrows";
import { subscribeCenter } from "./centerMapBus";
import { IslandLayer } from "./island/IslandLayer";
import { BetaRaidHud } from "./BetaRaidHud";
import { RaidWeatherHud } from "./weather/RaidWeatherHud";
import { BetaEffectHud } from "./BetaEffectHud";
import { useCastleMode } from "./castleMode";
import { BetaRaidPathBadge } from "./BetaRaidPathBadge";
import { usePathBadgeTarget } from "./usePathBadgeTarget";
import { BetaRaidResourceBar } from "./BetaRaidResourceBar";
import type { CanvasProps } from "./betaCanvasProps";
import { buildObjectRings } from "./objectRing";
import { useFogZones } from "./sight/useFogZones";
import { fogTapKind } from "./sight/fogReach";
import { objectKindsOf } from "./objectKind";
import { useCanvasResizeWheel } from "./useCanvasResizeWheel";
import { useMapToolGestures } from "./hand/useHandBrush";
import { MineBuildLayer } from "./mine-build/MineBuildLayer";
import { TreePlacementBar } from "./tree-map/TreePlacementBar";
import { LadderBar } from "./sight/LadderBar";
import { treePlacement, type TreeItem } from "./tree-map/treePlacement";
import { handTakesAt } from "./hand/handTap";
import { isIslandMapId } from "@/lib/raid/island/ids";

/** Один объект на «тиров нет»: новый {} на каждый рендер будил бы кадр зря. */
const NO_TIERS: Record<string, number> = {};
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
  newspapers,
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
  heroMount,
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
  const [snowStage,setSnowStage]=useState(0);
  const [puddles,setPuddles]=useState(false);
  // Dictionary of terrain types only: never enumerate the world's cells.
  const waterTerrainIds = useMemo(() => new Set(Object.entries(terrains)
    .filter(([, item]) => isWaterName((item as { name?: string }).name))
    .map(([id]) => id)), [terrains]);
  const snowTerrainKeys=useMemo(()=>new Set(Object.entries(terrains).flatMap(([id,item])=>{
    const name=(item as {name?:string}).name;
    return name&&!isWaterName(name)?[`t:${id}`]:[];
  })),[terrains]);
  const lang = useLang();
  const audioCell = playerPos ? `${playerPos.q},${playerPos.r}` : null;
  const onHeroMotion = useRaidMovementAudio(!editActive && !!playerPos,
    audioCell, !!audioCell && !!ships.get(audioCell)?.mine,
    !!audioCell && !!cells[audioCell]?.roadId, mountTier(heroMount) === "none");
  const pendingPathTarget = usePathBadgeTarget(
    { pendingPath, pendingAction, cells, buildings, buildingTiers, doorTolls },
    lang,
    energy,
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
    heroMount,
  );

  const worldArt = useWorldArt(map.id, imgCache, true, map.name);

  useEffect(()=>{
    if(!newspapers?.length||imgCache.current.has('newspaper'))return;
    const image=new Image();image.onload=requestRedraw;image.src=newspaperSprite;
    imgCache.current.set('newspaper',image);
    return()=>{image.onload=null;};
  },[!!newspapers?.length,imgCache,requestRedraw]);

  // Ободки объектов — раз на словарь, а не на кадр: редкость не меняется.
  const objectRings = useMemo(() => buildObjectRings(objects), [objects]);

  // Кэш типов объектов — раз на словарь.
  const objectKinds = useMemo(() => objectKindsOf(objects), [objects]);

  const fogZones = useFogZones({ store, playerPos, mineFlags, ground, buff: buffEffects, mapId: map.id });

  // Точка отсчёта гекс-сетки — один раз, уходит в memo-пропсы HUD.
  const grid = useMemo(() => {
    const c0q = Math.floor(map.size / 2);
    return { c0q, centerQ: c0q - Math.floor((c0q - (c0q & 1)) / 2) };
  }, [map.size]);
  const { castle, castleShown, castleArt } = useRaidCastle(map, store, castleCell);

  // Кадр ходит по колонкам и сетке карты (mapIndex поверх mapStore).
  const visualTerrains = useMemo(() => worldTerrainArt(terrains, worldArt.art), [terrains, worldArt.art]);
  const overviewLandscape = useMemo(() => ({ mapId: map.id, mapName: map.name, artVersion: worldArt.art?.version, cells, terrains: visualTerrains }), [map.id, map.name, cells, visualTerrains, worldArt.art]);
  const index = useMemo(() => buildMapIndex(store), [store]);

  // Радиус обзора один на всех (VISION_RADIUS).
  const fog = useFogView({ mapId: map.id, playerPos, store, voidCells, editActive: !!editActive });
  // Read current visibility without restarting the weather animation on hero movement.
  const rainMapRef = useRef({ store, fog, grid });
  rainMapRef.current = { store, fog, grid };
  const rainPoint = useCallback((x: number, y: number) => {
    const { store, fog, grid } = rainMapRef.current;
    if (!store) return null;
    const r = y / (R * 1.5) + grid.c0q;
    const q = x / (R * SQRT3) + grid.centerQ - (r - grid.c0q) / 2;
    const cell = hexRound(q, r), key = `${cell.q},${cell.r}`;
    if (store.index(cell.q, cell.r) < 0 || fog.voidCells.has(key) ||
        (!fog.revealAll && !fog.seen.has(key) && !fog.visible.has(key))) return null;
    const center = axialToPixel(cell.q, cell.r, grid.centerQ, grid.c0q);
    return { x: center.x + (x - center.x) * .55, y: center.y + (y - center.y) * .55 };
  }, []);
  const [externalTarget, setExternalTarget] = useState<{ q: number; r: number; mapId: string; preservePan?: boolean } | null>(null);
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
    waterTerrainIds: editActive ? undefined : waterTerrainIds,
    snowStage: editActive ? 0 : snowStage, snowTerrainKeys, puddles: !editActive && puddles,
    canvasRef,
    wrapRef,
    badgeRef,
    index,
    mapId: map.id,
    buildingTiers: buildingTiers ?? NO_TIERS,
    mineFlags,
    mineGuards,
    magicChests,
    lootBags,
    newspapers,
    ground,
    fieldSlots,
    warehouseBadges,
    runnerArrows: fleeArrows,
    images: worldArt.images,
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
    heroMount,
    availableMoves,
    onHeroMotion,
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
  }, worldArt.revision);
  redrawRef.current = renderer.requestRedraw;
  // Сундук поставили или разграбили, мешочек выпал или ушёл — кадр сразу.
  useEffect(() => requestRedraw(), [magicChests, lootBags, newspapers, ground, requestRedraw]);

  /**
   * Показать клетку: везём камеру и зажигаем метку. Зовут из окна «Добыча» —
   * там координаты кликабельны, и игроку надо не просто доехать, а увидеть,
   * КУДА он доехал.
   */
  const showCell = useCallback(
    (q: number, r: number) => {
      // A mine can be outside the temporarily loaded fog bounds. Keep the
      // requested cell as an explicit target so cameraBounds expands first and
      // the follow-up effect recenters on the actual q/r instead of the clamp.
      setExternalTarget({ q, r, mapId: map.id });
      park();
      centerOn(q, r, false);
      flashRef.current = { q, r, start: performance.now() };
      requestRedraw();
    },
    [centerOn, map.id, park, requestRedraw],
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

  // Entering planting shows the hero's real neighbourhood, even if the camera
  // was parked elsewhere. This moves only the camera, never the hero.
  const centeredTree = useRef<TreeItem | null>(null);
  useEffect(() => {
    const center = () => {
      const item = treePlacement.get()?.item ?? null;
      if (!item) centeredTree.current = null;
      else if (item !== centeredTree.current && playerPos) {
        centeredTree.current = item;
        goToHero(playerPos.q, playerPos.r);
      }
    };
    center();
    return treePlacement.subscribe(center);
  }, [goToHero, playerPos?.q, playerPos?.r]);

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
      subscribeCenter(({ q, r, ttlMs, preservePan }) => {
        setExternalTarget({ q, r, mapId: map.id, preservePan });
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

  useCanvasResizeWheel({ wrapRef, canvasRef, reclamp, requestRedraw, zoomBy });
  // Стройка шахты водит заготовку, земля в руке — кисть долгим нажатием, иначе — карта.
  const gestures = useMapToolGestures(handlers, { canvasRef, offsetRef, scaleRef, grid });

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
    // Туман: обычный тап, «только маршрут» (досягаемость) или мимо — fogTapKind.
    const free = !!editActive || handTakesAt(q, r) || fog.revealAll || isIslandMapId(map.id);
    const kind = fogTapKind({ q, r, free, seen: fog.seen, visible: fog.visible, reach: fogZones.reach, store });
    if (kind) onCellClick(q, r, kind === "blind");
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
        onPointerDown={(e) => { if (!targetOnMap?.preservePan) setExternalTarget(null); gestures.onPointerDown(e); }}
        onPointerMove={gestures.onPointerMove}
        onPointerUp={gestures.onPointerUp}
        onPointerCancel={gestures.onPointerUp}
        onTouchStart={(e) => { if (!targetOnMap?.preservePan) setExternalTarget(null); gestures.onTouchStart(e); }}
        onTouchMove={gestures.onTouchMove}
        onTouchEnd={gestures.onTouchEnd}
        onTouchCancel={gestures.onTouchEnd}
        onClick={handleClick}
      />
      <MapWaterLayers bind={renderer.bindWater} />

      <RaidWeatherHud key={map.id} mapId={map.id} ru={lang === "ru"} isAdmin={isAdmin} visualsEnabled={!editActive} camera={{ offsetRef, scaleRef, heroRef: renderer.heroRef, rainPoint, onSnowStage: setSnowStage, onPuddles: setPuddles }} />

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
      <IslandLayer mapId={map.id} playerPos={playerPos} store={store} seen={fog.seen} visible={fog.visible} />
      <MineBuildLayer />
      <TreePlacementBar />
      <LadderBar />
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






