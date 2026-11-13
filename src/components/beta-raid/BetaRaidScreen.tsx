import { useWorldArrival } from "./world-arrival/useWorldArrival";
import {useNewspapers} from "../newspaper/useNewspapers";
import { useBuildingWindowAudio } from '@/hooks/useBuildingWindowAudio';
// Бета-рейд: главный экран
import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { useStarsForDarai } from "./useStarsForDarai";
import { useMapFlags } from "./useMapFlags";
import { fetchMineGuards } from "@/components/beta-raid/mine/mineGuardsQuery";
import { getFieldSlots } from "@/server/api/beta-raid/field";
import { AdminPanels } from "./AdminPanels";
import { useEnergy } from "@/lib/hooks/useEnergy";
import { useBetaRaidData } from "./useBetaRaidData";
import { BetaRaidCanvas } from "./BetaRaidCanvas";
import { AdminLiveLayer, AdminRaidRestore, EconomyPanel } from "./adminLazy";
import { subscribeEconomyOpen } from "./economyOpenBus";
import { BetaRaidHeader } from "./BetaRaidHeader";
import { BetaRaidTournament } from "./BetaRaidTournament";
import { RaidCastleButton } from "./RaidCastleButton";
import { useBetaMovement } from "./useBetaMovement";
import { useRaidFight } from "./fight/useRaidFight";
import { useRaidLiveStream } from "./useRaidLiveStream";
import { usePlayerDotsFeed } from "./playerDots";
import { useShips, type ShipMark } from "./useShips";
import { useWarehouseBadges } from "./useWarehouseBadges";
import { useAboard } from "./useAboard";
import { useAvailableMoves } from "./useAvailableMoves";
import { useMoveMult } from "@/components/beta-raid/useMoveMult";
import { useAdjacentShip } from "./useAdjacentShip";
import { BetaNearbyPanels } from "./BetaNearbyPanels";
import { BetaRaidLoading, BetaRaidNoMap, BetaRaidLoadError } from "./BetaRaidStates";
import { raidScreen } from "@/components/game/screenReadiness";
import { useAdminLive } from "./useAdminLive";
import { leadForTap } from "./mergeBlocks";
import { useApproachDone } from "./useApproachDone";
import { useDecorInteract } from "./useDecorInteract";
import { useAdjacentObject } from "./useAdjacentObject";
import { getMySelectedHero } from "@/server/api/heroes-select";
import { BetaRaidOverlays } from "./BetaRaidOverlays";
import { useCellTap } from "./useCellTap";
import { useDoorTolls } from "./useDoorTolls";
import { useQuery } from "@tanstack/react-query";
import { getSession } from "@/server/api/user-auth";
import { thumb } from "@/lib/image";
import { useSlowExtra } from "./useSlowExtra";
import { useRaidHeroUi } from "./useRaidHeroUi";
import { BiomeGenPanelLive } from "./BiomeGenPanelLive";
import { useGenSelection } from "./zonegen/useGenSelection";
import { isGenBrush } from "./brushPatch";
import { startClientProbe } from "@/lib/perf/clientProbe";
import { useMagicChests } from "./chest/useMagicChests";
import { MagicChestOverlay } from "./chest/MagicChestWindow";
import { useTowerUsed } from "./useTowerUsed";
import { useLootBags } from "./loot-bag/useLootBags";
import { usePendingActionProp } from "./usePendingActionProp";
import { useMineBuild } from "./mine-build/useMineBuild";
import { useTreeMapPlacement } from "./tree-map/useTreeMapPlacement";
import { useLadder } from "./sight/useLadder";
import { useHandItem } from "./hand/useHandItem";
import { useReopenBuilding } from "@/components/beta-raid/unknownExtra";

/** Пустой маршрут — одна ссылка на всех: см. стабильные ссылки ниже. */
const NO_PATH: Array<{ q: number; r: number; cost: number }> = [];
const NO_EFFECTS: never[] = []; // пустые эффекты — один объект, не новый на каждый рендер

export function BetaRaidScreen({
  onClose,
  fullscreen,
  onToggleFullscreen,
  onCastle,
  onLoadingBack,
  onReadiness,
  onOpenGiftPack,
}: {
  onClose: () => void;
  fullscreen?: boolean;
  onToggleFullscreen?: () => void;
  /** Рейд открыт из замка (вход админа): кнопка «Замок» возвращает туда. */
  onCastle?: () => void;
  onOpenGiftPack?: (gift: import("@/server/api/gifts").MyGift) => void;
  /** Return to an already visited castle without waiting for a network check. */
  onLoadingBack?: () => void;
  onReadiness?: (state: "loading" | "ready" | "error" | "empty") => void;
}) {
  // Цены в DARAI звездочнику без DARAI — в звёздах (lib/starsForDarai.ts).
  useStarsForDarai();
  useWorldArrival();
  // Живой поток карты и раскладка чужих игроков — мимо состояния экрана:
  // чужой шаг будит один кадр холста, а не весь экран (playerDots).
  useRaidLiveStream();
  usePlayerDotsFeed();
  const [building, setBuilding] = useState<{ q: number; r: number } | null>(null); // тапнутая постройка
  useBuildingWindowAudio(building !== null);
  /** Открытый город: координата РАТУШИ, к которой привязана клетка. */
  const session = useQuery({ queryKey: ["session"], queryFn: () => getSession() });
  /**
   * Клетки под генератор зон (кисть «Биом» или прямоугольник по двум углам) —
   * временный маркер на карте, см. useGenSelection. Правки уходят в общую
   * очередь кисти через штатный queueCell (см. BiomeGenPanelLive).
   */
  const gen = useGenSelection();
  const selectedForGen = gen.selected;
  // «$ Экономика» — inline-панель под картой. Открытие/сворачивание живёт в
  // общем bus (economyOpenBus): кнопка в AdminRaidRestore зовёт toggle, здесь
  // мы просто рендерим панель по флагу. Так не нужно тащить стейт через
  // 5 пропсов от AdminRaidRestore до самой панели.
  const [economyOpen, setEconomyOpen] = useState<boolean>(false);
  useEffect(() => subscribeEconomyOpen(setEconomyOpen), []);
  // Проба нагрузки на устройстве — живёт ровно пока открыт экран рейда.
  useEffect(() => startClientProbe(), []);
  const [ship, setShip] = useState<{ q: number; r: number; mark: ShipMark } | null>(null); // открытый корабль
  const { ships } = useShips();
  const selectedHero = useQuery({
    queryKey: ["my-selected-hero"],
    queryFn: () => getMySelectedHero(),
    staleTime: 60_000,
  });
  const { mapQ, stateQ, cells, domeCells, store } = useBetaRaidData();
  /** Режим админа: тап по клетке красит или открывает её правку. */
  const adminLive = useAdminLive({ onGenToggle: gen.onGenToggle, mapId: mapQ.data?.map?.id });
  // Вышел из правки карты — панель генератора и жёлтое выделение уходят вместе
  // с ней: кисть «Биом» в руках остаётся, и без этого панель висела над игрой.
  const genReset = gen.reset;
  useEffect(() => {
    if (!adminLive.on) genReset();
  }, [adminLive.on, genReset]);
  useReopenBuilding(mapQ.data?.map?.id, setBuilding); // окно, ради которого перезагрузились
  // Флажки на постройках поверх карты: шахты/поля/деревья аккаунта и столбы
  // заклинаний, забранные выбранным героем (useMapFlags). Отдельными запросами:
  // карта общая и кэшируется сутки, а флаги у каждого свои и меняются чаще.
  const mineFlags = useMapFlags(stateQ.data?.position ?? null, adminLive.on);
  // Живые боссы-охранники шахт: рисуем поверх шахты (getMineGuards). Отдельным
  // запросом, как флаги: карта общая и кэшируется, а охрана меняется в бою.
  const mineGuardsQ = useQuery({
    queryKey: ["beta-raid-mine-guards"],
    queryFn: ({ client }) => fetchMineGuards(client),
    staleTime: 30_000,
  });
  // Занятость полей с лимитом — значок «свободно/всего» над зданием, как у
  // кораблей. Отдельным запросом: карта общая, а работники меняются чаще.
  const fieldSlotsQ = useQuery({
    queryKey: ["beta-raid-field-slots"],
    queryFn: () => getFieldSlots(),
    staleTime: 30_000,
  });
  // Бейджи складов «мои+общие единицы к сбору» — свой хук (useWarehouseBadges).
  const whBadgesQ = useWarehouseBadges();
  // Магические сундуки игроков: слой карты и открытое окно (chest/useMagicChests).
  const chest = useMagicChests();
  // Режим героя и его окна (см. useRaidHeroUi): нет блока hero — всё прежнее.
  const heroUi = useRaidHeroUi(stateQ.data);
  // Ссылки для канваса — стабильные: новый массив/замыкание на каждый рендер
  // экрана попадал в deps цикла кадров (useMapRenderer) и будил полную
  // перерисовку по любому поводу (опрос энергии, poll игроков, SSE) и ломал
  // memo HUD. Колбэки читают свежие функции через ref.
  const stopWalkRef = useRef<() => void>(() => {});
  const clearPendingRef = useRef<() => void>(() => {});
  const approachDoneRef = useRef<(reach?: number | null) => void>(() => {});
  const onStopStable = useCallback(() => stopWalkRef.current(), []);
  const onCancelPathStable = useCallback(() => clearPendingRef.current(), []);
  const onConfirmPathStable = useCallback((reach?: number | null) => approachDoneRef.current(reach), []);

  const playerPos = stateQ.data?.position ?? null;
  const papers=useNewspapers(mapQ.data?.map?.id,playerPos,cells);
  /** Замедление и живая надбавка к шагу: истекает сама, без запроса к серверу. */
  const slow = stateQ.data?.effects?.slow ?? null;
  const slowExtra = useSlowExtra(slow);
  const energyQ = useEnergy();
  const energy = energyQ.data?.energy ?? stateQ.data?.energy ?? 0;

  const adjacentObject = useAdjacentObject(cells, playerPos, mapQ.data);
  // Двери: маршрут их обходит, а без обхода ведёт сквозь и показывает цену
  // (useDoorTolls); плату берёт только шаг в саму дверь. Без героя — null:
  // рамки уровня у двери без героя не пройти (сервер спросит «выбери героя»).
  const doors = useMemo(() => new Set<string>(mapQ.data?.doors ?? []), [mapQ.data]);
  const doorInfo = useDoorTolls(
    doors,
    selectedHero.data?.heroId ? selectedHero.data.level : null,
    mapQ.data?.map?.id ?? null,
  );

  /**
   * За штурвалом ли игрок. Спрашиваем список причалов — капитана назначает
   * сервер; своё судно клиент двигает правкой этого же списка (useBetaMovement).
   */
  const onShip = useAboard(ships, playerPos);
  /** Корабль под ногами или по соседству: чем управляем и куда садиться. */
  const nearShip = useAdjacentShip(ships, playerPos, cells);

  // Доступные ходы — любая проходимая соседняя клетка (пути убраны).
  const energyMult = useMoveMult(); // остров — ходы в 10 раз дешевле; погода — герой/судно
  const availableMoves = useAvailableMoves({
    playerPos,
    cells,
    terrains: mapQ.data?.terrains,
    roads: mapQ.data?.roads,
    decorations: mapQ.data?.decorations,
    slowExtra,
    stepDiscount: heroUi.stepDiscount,
    onShip,
    ships,
    energyMult,
  });

  const {
    pendingPath,
    pendingAction,
    walking,
    stopWalk,
    moveAlongPath,
    handleCellClick,
    walkTo,
    approachCell, approachPath,
    clearPending,
  } = useBetaMovement({
    playerPos,
    cells,
    terrains: mapQ.data?.terrains,
    roads: mapQ.data?.roads,
    decorations: mapQ.data?.decorations,
    availableMoves,
    onShip,
    ships,
    slowExtra,
    stepDiscount: heroUi.stepDiscount,
    energyMult,
    doors,
    hardDoors: doorInfo.hardDoors,
  });

  // Бой: тап по цели рядом бьёт сразу, «i» и приход по маршруту — окно цели.
  const fight = useRaidFight({ energy, cells, objects: mapQ.data?.objects, playerPos, fullscreen });

  // Вышки, отработавшие у этого игрока: по ним ходим как по обычной клетке.
  const towerUsed = useTowerUsed();

  // Декор со «взаимодействием»: уничтожить за энергию, товар — в рюкзак.
  const decor = useDecorInteract({ playerPos, approachCell, approachPath, energy, tolls: doorInfo.tolls });
  // Мешочки (§8.21): слой, тап и окно; прибытие к постройке и сундуку — через него.
  const bags = useLootBags({ playerPos, cells, ships, chest, approachCell, walkTo, clearPending, setBuilding, buff: stateQ.data?.effects?.buff });
  // Стройка шахты (§8.59 п. 8): режим берёт тап первым, чертёж — перед обычным ходом.
  const mine = useMineBuild({ mapId: mapQ.data?.map?.id, playerPos, energy, approachCell });
  // Вещь в руке (земля, динамит): тап решает рука (hand/handTap), ход — как всегда.
  const land = useHandItem({ playerPos, cells, clearPath: clearPending });
  const trees = useTreeMapPlacement({ mapId: mapQ.data?.map?.id, playerPos, walking, clearPath: clearPending, stopWalk });
  const ladder = useLadder({ playerPos, cells, terrains: mapQ.data?.terrains });
  const onGameCell = useCellTap({
    decorTap: decor.tap,
    chest: { marks: chest.chests, open: chest.openChest },
    towerUsed,
    cells,
    objects: mapQ.data?.objects,
    playerPos,
    ships,
    terrains: mapQ.data?.terrains ?? {},
    onShip,
    openShip: setShip,
    interact: fight.interact,
    openBuilding: setBuilding,
    approachCell,
    handleCellClick: (q, r) => mine.planTap(q, r) || handleCellClick(q, r),
    walking,
  });

  /** Дошли до цели маршрута — открываем постройку или забираем лут. */
  const onApproachDone = useApproachDone({
    cells,
    objects: mapQ.data?.objects,
    pendingPath: pendingPath ?? null,
    pendingAction,
    moveAlongPath,
    openBuilding: bags.arrive,
    interact: fight.arrive,
    onDecor: decor.arrive,
    onMinePlan: mine.arrive,
    ships,
    openShip: setShip,
  });

  const pendingActionProp = usePendingActionProp(pendingAction);

  // В режиме правки тап уходит админу; иначе играем как обычно. Клетка
  // объединённого блока без своего объекта — это тап по постройке блока.
  const onCanvasCell = (q: number, r: number, blind?: boolean) => {
    // Неразведанное в досягаемости — только маршрут; в клетку не пройти — к соседней.
    if (blind) return void (handleCellClick(q, r) || approachCell(q, r, null));
    if (adminLive.handleTap(q, r) || ladder.tap(q, r) || trees.tap(q, r) || mine.buildTap(q, r) || land.tap(q, r)) return;
    const own = ships.has(`${q},${r}`) || !!chest.chests?.[`${q},${r}`]; // судно и сундук — свои
    const lead = store && !own ? leadForTap(store, q, r, playerPos) : null;
    if (papers.tap(q,r)) return;
    if (bags.tap(q, r, lead)) return;
    onGameCell(lead?.q ?? q, lead?.r ?? r);
  };

  const readiness = raidScreen(mapQ, stateQ, !!store);
  useEffect(() => {
    onReadiness?.(readiness);
  }, [onReadiness, readiness]);
  const loadingBack = fullscreen ? onLoadingBack : onClose;
  const retryLoad = () => {
    void mapQ.refetch();
    void stateQ.refetch();
  };
  if (readiness === "error")
    return <BetaRaidLoadError fullscreen={fullscreen} onRetry={retryLoad} onBack={loadingBack} />;
  if (readiness === "loading")
    return <BetaRaidLoading fullscreen={fullscreen} onBack={loadingBack} />;
  if (!mapQ.data?.map || !store)
    return <BetaRaidNoMap fullscreen={fullscreen} onClose={loadingBack} />;

  const { map, terrains, objects, decorations = {}, roads = {} } = mapQ.data;

  stopWalkRef.current = stopWalk;
  clearPendingRef.current = clearPending;
  approachDoneRef.current = onApproachDone;

  return (
    <div data-raid-editor-tools={fullscreen && !!(session.data?.isAdmin || adminLive.designer || adminLive.islandGod)} className={fullscreen ? "fixed inset-0 z-40 bg-black" : "flex flex-col gap-1"}>
      {!fullscreen && (
        <>
          <BetaRaidHeader
            mapName={map.name}
            onClose={onClose}
            hexMain={session.data?.raidMode === "hex"}
            castleAccess={!!session.data?.isCastleEditor}
          />
          {/* Плашки сбора шахт и наград переехали в кружок «Добыча» под
              мини-картой: две полосы над картой съедали её высоту на телефоне
              и появлялись рывком, когда что-то накапливалось. */}
          {session.data?.isAdmin && <AdminRaidRestore />}
          {(session.data?.isAdmin || adminLive.designer || adminLive.islandGod) && <AdminLiveLayer live={adminLive} />}
        </>
      )}

      <BetaRaidCanvas
        onOpenGiftPack={onOpenGiftPack}
        map={map}
        store={store}
        cells={cells}
        terrains={terrains}
        voidCells={domeCells}
        objects={objects}
        decorations={decorations}
        roads={roads}
        buildings={mapQ.data?.buildings}
        buildingTiers={mapQ.data?.buildingTiers}
        mineFlags={mineFlags}
        mineGuards={mineGuardsQ.data?.guards}
        magicChests={chest.chests}
        newspapers={papers.spots}
        lootBags={bags.marks}
        ground={bags.ground}
        fieldSlots={fieldSlotsQ.data?.slots}
        warehouseBadges={whBadgesQ.data?.badges}
        playerPos={playerPos}
        castleCell={stateQ.data?.hero?.castle}
        availableMoves={availableMoves}
        energy={energy}
        onCellClick={onCanvasCell}
        walking={walking}
        onStop={onStopStable}
        heroSprite={stateQ.data?.heroSprite ?? null}
        heroMount={stateQ.data?.mount ?? null}
        chipEffects={stateQ.data?.effects?.chips ?? NO_EFFECTS}
        weakenEffects={stateQ.data?.effects?.weaken ?? NO_EFFECTS}
        buffEffects={stateQ.data?.effects?.buff ?? NO_EFFECTS}
        slow={slow}
        heroAvatarUrl={
          selectedHero.data?.imageUrl ? thumb(selectedHero.data.imageUrl, 96, "black") : null
        }
        onPickHero={heroUi.openPicker}
        hero={heroUi}
        ships={ships}
        pendingCells={adminLive.brush.pendingCells}
        selectedForGen={(session.data?.isAdmin || adminLive.islandGod) && adminLive.on ? selectedForGen : undefined}
        mergeSel={adminLive.on && adminLive.mode === "merge" ? adminLive.merge.sel : undefined}
        pendingPath={pendingPath ?? NO_PATH}
        pendingAction={pendingActionProp}
        doorTolls={doorInfo.tolls}
        onConfirmPath={onConfirmPathStable}
        onCancelPath={onCancelPathStable}
        isAdmin={session.data?.isAdmin}
        editActive={adminLive.on}
        fullscreen={fullscreen}
        onToggleFullscreen={onToggleFullscreen}
      />

      {/* «$ Экономика» — inline-панель под картой (перед действиями/турниром).
          Только для админа, живёт по событиям economyOpenBus. Тап по клетке
          в панели центрирует карту, но панель НЕ закрывает — можно следить
          за срезом в реальном времени, продолжая ходить по карте.
          В полноэкранном она тоже нужна: карту правят как раз на весь экран,
          а кнопка «$ Экономика» лежит в панели «Восстановление» — раньше она
          там нажималась, а панель не показывалась никогда (владелец, 08.10). */}
      {!fullscreen && session.data?.isAdmin && economyOpen && <EconomyPanel />}
      {fullscreen && session.data?.isAdmin && economyOpen && (
        <div className="absolute inset-x-2 bottom-24 top-14 z-[70] overflow-y-auto overscroll-contain rounded-2xl border border-border bg-background/95 p-2 backdrop-blur-sm">
          <EconomyPanel />
        </div>
      )}

      {/* Инструменты админа в полноэкранном: карту как раз правят на весь
          экран, а обвязка страницы там скрыта вместе с ними. Сворачиваются
          по отдельности — развёрнутые вдвоём закрывают пол-карты. В мире
          креатора вместо них — студия (AdminPanels → creator/CreatorStudio). */}
      {fullscreen && (session.data?.isAdmin || adminLive.designer || adminLive.islandGod) && (
        <AdminPanels live={adminLive} restore={adminLive.money ? <AdminRaidRestore /> : undefined} />
      )}

      {/* Карточка соседнего объекта и корабля нужна и в полноэкранном: без неё
          тап по боссу в упор не давал ничего — окно просто не рисовалось.
          В полноэкранном кладём её поверх карты, над нижним рядом кнопок. */}
      <div
        className={
          fullscreen ? "pointer-events-none absolute inset-x-2 bottom-24 z-40 space-y-1" : ""
        }
      >
        <div className="pointer-events-auto">
          <BetaNearbyPanels
            ship={fight.encounter ? null : nearShip}
            object={fight.encounter ? null : adjacentObject}
            objectBusy={fight.busyAt(adjacentObject)}
            onOpenShip={(s) => setShip({ q: s.q, r: s.r, mark: s.mark })}
            onOpenObject={fight.strike}
            onInfoObject={fight.openInfo}
          />
        </div>
      </div>

      {/* Турнир вернулся под карту: окно «Слава» живёт во внутрянке замка, а
          она открыта только дизайнеру и админам — без этого блока рейтинг
          пропал бы у ВСЕХ игроков (правка 22.09). Блок свёрнут, полосы
          заголовка карте не жалко. */}
      {!fullscreen && <BetaRaidTournament />}

      {/* Из замка вход — кружком замка в HUD (castleMode); эта кнопка — только
          прежний переход редактора во внутрянку. */}
      {fullscreen && !onCastle && session.data?.isCastleEditor && (
        <div className="fixed bottom-12 right-12 z-[60] sm:bottom-2">
          <RaidCastleButton />
        </div>
      )}

      {/* Окна боя, постройки и корабля рисуются поверх всего и в полном
          экране тоже: иначе взаимодействовать с картой было нечем. */}
      {
        <BetaRaidOverlays
          hero={heroUi}
          building={building}
          ship={ship}
          shipAboard={onShip && ship?.q === playerPos?.q && ship?.r === playerPos?.r}
          /* Судно стоит ровно под ногами, но на борту мы не числимся —
             возврат бесплатен (ship-ride: посадка на своей клетке). */
          shipUnderfoot={!onShip && ship?.q === playerPos?.q && ship?.r === playerPos?.r}
          fight={fight.ui}
          bossEncounter={!!fight.ui.encounter && objects[fight.ui.encounter.objectId]?.kind === "boss"}
          energy={energy}
          slowExtra={slowExtra}
          onCloseBuilding={() => setBuilding(null)}
          onGoToBuilding={(q, r) => {
            setBuilding(null);
            // Без подтверждения-подсказки: игрок уже нажал «Идти сюда» в окне.
            void walkTo(q, r);
          }}
          onCloseShip={() => setShip(null)}
        />
      }

      {/* Панель генератора: выплывает, как только админ взял кисть «Биом» —
          там же выбирается кисть/прямоугольник, поэтому ждать первой клетки
          нельзя. Правки уходят в общую очередь кисти — «Выгрузить» сверху их
          же и заберёт. Плавающая, поверх карты в любом режиме. */}
      {(session.data?.isAdmin || adminLive.islandGod) &&
        adminLive.on &&
        (selectedForGen.size > 0 || isGenBrush(adminLive.brush.brush)) && (
          <BiomeGenPanelLive
            count={selectedForGen.size}
            selectedForGen={selectedForGen}
            queueCells={adminLive.brush.queueCells}
            discardKeys={adminLive.brush.discardKeys}
            onResetSelection={gen.reset}
            selectMode={gen.selectMode}
            onSelectMode={gen.setSelectMode}
            corner={gen.corner}
            tooBig={gen.tooBig}
          />
        )}

      <MagicChestOverlay layer={chest} walkTo={walkTo} />
      {papers.sheet}
      {bags.sheet}
      {mine.sheet}
      {decor.chopDialog}
    </div>
  );
}


