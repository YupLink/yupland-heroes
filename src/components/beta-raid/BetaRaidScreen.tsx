// Бета-рейд: главный экран
import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { useStarsForDarai } from "./useStarsForDarai";
import { useMapFlags } from "./useMapFlags";
import { fetchMineGuards } from "@/components/beta-raid/mine/mineGuardsQuery";
import { getFieldSlots } from "@/server/api/beta-raid/field";
import { AdminFullscreenPanels } from "./AdminFullscreenPanels";
import { useEnergy } from "@/lib/hooks/useEnergy";
import { useBetaRaidData } from "./useBetaRaidData";
import { BetaRaidCanvas } from "./BetaRaidCanvas";
import { AdminLiveLayer, AdminRaidRestore, EconomyPanel } from "./adminLazy";
import { subscribeEconomyOpen } from "./economyOpenBus";
import { BetaRaidHeader } from "./BetaRaidHeader";
import { BetaRaidTournament } from "./BetaRaidTournament";
import { RaidCastleButton } from "./RaidCastleButton";
import { useBetaMovement } from "./useBetaMovement";
import { useBetaEncounter } from "./useBetaEncounter";
import { useRaidLiveStream } from "./useRaidLiveStream";
import { usePlayerDotsFeed } from "./playerDots";
import { useShips, type ShipMark } from "./useShips";
import { useWarehouseBadges } from "./useWarehouseBadges";
import { useAboard } from "./useAboard";
import { useAvailableMoves } from "./useAvailableMoves";
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
import { useObjectInteract } from "./useObjectInteract";
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
  // Живой поток карты и раскладка чужих игроков — мимо состояния экрана:
  // чужой шаг будит один кадр холста, а не весь экран (playerDots).
  useRaidLiveStream();
  usePlayerDotsFeed();
  /** Открытая постройка: клетка, по которой тапнули. */
  const [building, setBuilding] = useState<{ q: number; r: number } | null>(null);
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
  /** Режим админа: тап по клетке красит или открывает её правку. */
  const adminLive = useAdminLive({ onGenToggle: gen.onGenToggle });
  // Вышел из правки карты — панель генератора и жёлтое выделение уходят вместе
  // с ней: кисть «Биом» в руках остаётся, и без этого панель висела над игрой.
  const genReset = gen.reset;
  useEffect(() => {
    if (!adminLive.on) genReset();
  }, [adminLive.on, genReset]);
  /** Открытый корабль: клетка воды и чей он. */
  const [ship, setShip] = useState<{ q: number; r: number; mark: ShipMark } | null>(null);
  const { ships } = useShips();
  const selectedHero = useQuery({
    queryKey: ["my-selected-hero"],
    queryFn: () => getMySelectedHero(),
    staleTime: 60_000,
  });
  const { mapQ, stateQ, cells, domeCells, store } = useBetaRaidData();
  // Флажки на постройках поверх карты: шахты/поля/деревья аккаунта и столбы
  // заклинаний, забранные выбранным героем (useMapFlags). Отдельными запросами:
  // карта общая и кэшируется сутки, а флаги у каждого свои и меняются чаще.
  const mineFlags = useMapFlags();
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
  const approachDoneRef = useRef<() => void>(() => {});
  const onStopStable = useCallback(() => stopWalkRef.current(), []);
  const onCancelPathStable = useCallback(() => clearPendingRef.current(), []);
  const onConfirmPathStable = useCallback(() => approachDoneRef.current(), []);

  const playerPos = stateQ.data?.position ?? null;
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
  const availableMoves = useAvailableMoves({
    playerPos,
    cells,
    terrains: mapQ.data?.terrains,
    roads: mapQ.data?.roads,
    slowExtra,
    stepDiscount: heroUi.stepDiscount,
    onShip,
    ships,
  });

  const {
    pendingPath,
    pendingAction,
    walking,
    stopWalk,
    moveAlongPath,
    handleCellClick,
    walkTo,
    approachCell,
    clearPending,
  } = useBetaMovement({
    playerPos,
    cells,
    terrains: mapQ.data?.terrains,
    roads: mapQ.data?.roads,
    availableMoves,
    onShip,
    ships,
    slowExtra,
    stepDiscount: heroUi.stepDiscount,
    doors,
    hardDoors: doorInfo.hardDoors,
  });

  const {
    encounter,
    setEncounter,
    fightResult,
    setFightResult,
    attack: attackMutation,
    collect,
    collecting,
  } = useBetaEncounter();

  /** Босс открывает окно с отрядом, лут забирается одним нажатием. */
  const interact = useObjectInteract({ openEncounter: setEncounter, collect });

  // Вышки, отработавшие у этого игрока: по ним ходим как по обычной клетке.
  const towerUsed = useTowerUsed();

  // Декор со «взаимодействием»: уничтожить за энергию, товар — в рюкзак.
  const decor = useDecorInteract({ playerPos, approachCell });
  // Мешочки (§8.21): слой, тап и окно; прибытие к постройке и сундуку — через него.
  const bags = useLootBags({ playerPos, cells, ships, chest, approachCell, walkTo, setBuilding });
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
    interact,
    openBuilding: setBuilding,
    approachCell,
    handleCellClick,
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
    interact,
    onDecor: decor.arrive,
    ships,
    openShip: setShip,
  });

  // pendingAction-проп мемоизируем по значениям: голый объект-литерал в JSX
  // пересоздавался каждый рендер → канвас пересчитывал цель и перерисовывался
  // (requestRedraw + placeBadge) на каждый ре-рендер, пока выбран маршрут.
  const pendingActionProp = useMemo(
    () =>
      pendingAction
        ? {
            kind: pendingAction.kind,
            q: pendingAction.q,
            r: pendingAction.r,
            extraCost: pendingAction.extraCost,
          }
        : null,
    // Завязка на ПРИМИТИВЫ, не на объект pendingAction: он и есть источник churn'а
    // (новая ссылка каждый рендер), включать его в deps бессмысленно.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pendingAction?.kind, pendingAction?.q, pendingAction?.r, pendingAction?.extraCost],
  );

  // В режиме правки тап уходит админу; иначе играем как обычно. Клетка
  // объединённого блока без своего объекта — это тап по постройке блока.
  const onCanvasCell = (q: number, r: number) => {
    if (adminLive.handleTap(q, r)) return;
    const own = ships.has(`${q},${r}`) || !!chest.chests?.[`${q},${r}`]; // судно и сундук — свои
    const lead = store && !own ? leadForTap(store, q, r, playerPos) : null;
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
    <div className={fullscreen ? "fixed inset-0 z-40 bg-black" : "flex flex-col gap-1"}>
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
          {session.data?.isAdmin && <AdminLiveLayer live={adminLive} />}
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
        selectedForGen={session.data?.isAdmin && adminLive.on ? selectedForGen : undefined}
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
          по отдельности — развёрнутые вдвоём закрывают пол-карты. */}
      {fullscreen && session.data?.isAdmin && (
        <AdminFullscreenPanels
          edit={<AdminLiveLayer live={adminLive} />}
          restore={<AdminRaidRestore />}
          editActive={adminLive.on}
        />
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
            ship={encounter ? null : nearShip}
            object={encounter ? null : adjacentObject}
            objectBusy={
              attackMutation.isPending ||
              (!!adjacentObject && collecting === `${adjacentObject.q},${adjacentObject.r}`)
            }
            onOpenShip={(s) => setShip({ q: s.q, r: s.r, mark: s.mark })}
            onOpenObject={interact}
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
          encounter={encounter}
          fightResult={fightResult}
          energy={energy}
          slowExtra={slowExtra}
          fighting={attackMutation.isPending}
          onAttack={(lineup) =>
            encounter &&
            attackMutation.mutate({
              objectId: encounter.objectId,
              q: encounter.q,
              r: encounter.r,
              lineup,
            })
          }
          onCloseBuilding={() => setBuilding(null)}
          onGoToBuilding={(q, r) => {
            setBuilding(null);
            // Без подтверждения-подсказки: игрок уже нажал «Идти сюда» в окне.
            void walkTo(q, r);
          }}
          onCloseShip={() => setShip(null)}
          onCloseEncounter={() => setEncounter(null)}
          onCloseResult={() => setFightResult(null)}
        />
      }

      {/* Панель генератора: выплывает, как только админ взял кисть «Биом» —
          там же выбирается кисть/прямоугольник, поэтому ждать первой клетки
          нельзя. Правки уходят в общую очередь кисти — «Выгрузить» сверху их
          же и заберёт. Плавающая, поверх карты в любом режиме. */}
      {session.data?.isAdmin &&
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
      {bags.sheet}
      {decor.chopDialog}
    </div>
  );
}
