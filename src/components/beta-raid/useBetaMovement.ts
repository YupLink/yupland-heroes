import { createRouteLifetime } from "./routeLifetime";
// Движение по гекс-карте: шаг, путь по маршруту, подтверждение маршрута.
// Вынесено из BetaRaidScreen — экран остаётся оркестратором (§13.6).
//
// Шаг рисуется сразу, не дожидаясь сервера: позиция и энергия ложатся в кэш
// оптимистично; судья — сервер, на его отказе позиция и маршрут откатываются.
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { approachRoute } from "./approachRoute";
import { pathCrossesDoor } from "./pathTolls";
import { routeTo, sayNeedBig, type RouteSearchOpts } from "./routeSearch";
import { DIRS, type ShipMap } from "./usePathfinding";
// Тип местности — из hexStepCost: там же живёт и цена шага по нему.
import type { TerrainInfo as Terrain } from "./hexStepCost";
import { BASE_STEP_MS, mountJumps, mountStepMs, mountTier } from "@/lib/hero/mount";
import { useSatietyMult } from "./useEnergyMult";
import type { Cell } from "./unpackMap";
import { ENERGY_KEY } from "@/lib/hooks/useEnergy";
import { useT } from "@/lib/i18n";
import { makeStepCache, STATE_KEY } from "./stepCache";
import { SHIPS_KEY } from "./patchShipsCache";
import { makeRoutePilot } from "./routeFleet";
import { makeStepSend } from "./stepSend";
import { setHeroStepMs, setHeroRouteActive } from "./heroPace";
import type { RaidState } from "./useBetaRaidData";

type Step = { q: number; r: number; cost: number };

/** Что произойдёт в конце маршрута. */
export type PendingAction = {
  kind: "collect" | "build" | "battle" | "decor" | "dig" | "ship" | "mineplan";
  q: number;
  r: number;
  /** Цена самого действия — она входит в общий счёт на метке маршрута. */
  extraCost: number;
};

export function useBetaMovement(opts: {
  playerPos: { q: number; r: number } | null;
  cells: Record<string, Cell> | undefined;
  terrains: Record<string, Terrain> | undefined;
  /** Дороги: шаг по ним стоит свою цену, а не цену местности. */
  roads?: Record<string, Terrain> | undefined;
  decorations?: Record<string, { bridge?: unknown }>;
  availableMoves: Array<{ q: number; r: number; cost: number }>;
  /** Игрок за штурвалом: по воде считаем цену как за плавание. */
  onShip?: boolean;
  /** Корабли на воде: чужой занятый не пропускает, свободный — это посадка. */
  ships?: ShipMap;
  /**
   * Поправки к цене шага, те же, что у сервера (move.ts): замедление дорожит
   * шаг, скорость героя удешевляет. Разъезд стоил обрыва маршрута на полпути.
   */
  slowExtra?: number;
  stepDiscount?: number;
  energyMult?: RouteSearchOpts["energyMult"]; // остров — 0,1; погода (useMoveMult)
  /**
   * Клетки-двери: маршрут их обходит, пока есть обход; нет обхода — ведёт
   * сквозь, и плату показывает плашка (routeSearch). Списание — шагом в дверь.
   */
  doors?: ReadonlySet<string>;
  /** Двери-стены и для маршрута сквозь двери (pathTolls.hardDoorsOf). */
  hardDoors?: ReadonlySet<string>;
}) {
  const t = useT();
  // Сытость шага на острове — в 10 раз меньше (island/satiety), как спишет сервер.
  const satietyMult = useSatietyMult();
  const terrains = opts.terrains; // купол — флаг клетки, словарь про него не знает
  const qc = useQueryClient();
  const [pendingPath, setPendingPath] = useState<Step[] | null>(null);
  /**
   * Что сделать, придя на место: забрать объект или открыть постройку.
   * Тап по дальней монетке — это «дойди и забери» одним действием, а не два
   * отдельных: игрок видит общую цену и подтверждает один раз.
   */
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [walking, setWalking] = useState(false);
  const lifetime = useRef(createRouteLifetime()).current;
  const routeVisualOwner = useRef(Symbol("hero-route")).current;
  /**
   * Просьба встать посреди маршрута.
   *
   * Ref, а не состояние: цикл шагов живёт в одном вызове и перерисовку не
   * видит — прочитать он может только ref. Проверяем ПЕРЕД шагом: уже
   * отправленный шаг не отменить, но следующий не уйдёт, и герой встанет там,
   * где его застали, а не в конце маршрута.
   */
  const stopRef = useRef(false);
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Как шаг ложится в кэш до ответа сервера — в stepCache.
  const cache = makeStepCache(qc);

  const clearPending = () => {
    setPendingPath(null);
    setPendingAction(null);
    if (pendingTimer.current) {
      clearTimeout(pendingTimer.current);
      pendingTimer.current = null;
    }
  };

  useEffect(() => {
    lifetime.mount();
    return () => {
      setHeroRouteActive(false, routeVisualOwner);
      lifetime.unmount();
      stopRef.current = true;
      if (pendingTimer.current) clearTimeout(pendingTimer.current);
    };
  }, []);

  // Отправка шагов: по одному (с кораблём) и пачкой наперёд по суше — stepSend.
  const send = makeStepSend({ qc, cache, t, satietyMult, cells: opts.cells, terrains });
  const { stepOnWater } = send;
  /** Конь выбранного героя (§8.84) — из состояния рейда: темп шага и прыжок пегаса. */
  const mount = () => mountTier(qc.getQueryData<RaidState>(STATE_KEY)?.mount);
  const searchOpts = (): RouteSearchOpts => ({ ...opts, jump: mountJumps(mount()) });

  /**
   * Идём по подтверждённому маршруту шаг за шагом.
   * Возвращает true, только если прошли ВЕСЬ путь: на отказе сервера (кончилась
   * энергия, клетку занял сосед) маршрут обрывается на полпути, и звать
   * действие в конце уже не по чему — герой стоит не там.
   *
   * По дороге ведём судно: пока идём по воде — оно едет с нами, сошли на
   * берег — осталось там, где сошли. Правки те же, что публикует сервер, и
   * ложатся ДО его ответа: иначе на воде под героем на мгновение оказывалась
   * пустая вода, а корабль — позади.
   */
  // limit — только первые N шагов (§8.78); лоцман судна видит весь путь (океан впереди).
  const moveAlongPath = async (path: Step[], limit?: number): Promise<boolean> => {
    const token = lifetime.begin();
    if (token === null) return false;
    try {
      setWalking(true);
      setHeroRouteActive(true, routeVisualOwner);
      stopRef.current = false;
      clearPending();
      let done = true;
      // «Флот трогали» — по маршруту, а не по успеху шага: старт с клетки, где
      // кэш видит судно (пилот берёт «на борту» из кэша — соврал кэш, сервер
      // сделал сход, а клиент узнал бы лишь опросом в 60 с), либо правка судна в
      // кэше — даже если шаг потом отказал: сервер мог его применить, и после
      // отката причалы врут как до фикса 262c68c9 (герой «пешком» на воде).
      let fleetMoved =
        !!opts.playerPos && !!opts.ships?.has(`${opts.playerPos.q},${opts.playerPos.r}`);
      const pilot = makeRoutePilot(qc, opts.playerPos, { path, cells: opts.cells, terrains });
      const steps = limit != null ? path.slice(0, limit) : path;
      // По суше — пачками наперёд в темпе коня (§8.84); с кораблём — по шагу, как было.
      const onLand = !fleetMoved && !opts.onShip && !steps.some(stepOnWater);
      const pct = Number(qc.getQueryData<RaidState>(STATE_KEY)?.mountPct) || 0;
      const stepMs = onLand ? mountStepMs(mount(), pct) : BASE_STEP_MS;
      setHeroStepMs(stepMs);
      const stopped = () => stopRef.current || !lifetime.valid(token);
      if (onLand) {
        done = await send.walkLand(steps, stepMs, stopped);
      } else {
        for (const step of steps) {
          // Нажали «стоп» — дальше не идём. Пройденное остаётся пройденным:
          // энергия за сделанные шаги уже списана честно.
          if (stopped()) {
            done = false;
            break;
          }
          const fleet = pilot.step(step, stepOnWater(step));
          // Судно на той стороне заняли, пока мы шли: встаём здесь, до траты.
          if (fleet.blocked) {
            toast.error(t(fleet.needBig ? "braid.ship_need_big" : "braid.ship_taken"));
            done = false;
            break;
          }
          fleetMoved = fleetMoved || fleet.deltas.length > 0;
          if (!(await send.sendStep(step, fleet.bigOnly))) {
            pilot.rollback(fleet.snapshot);
            done = false;
            break;
          }
        }
      }
      // Один рефетч в конце пути вместо одного на каждый шаг.
      qc.invalidateQueries({ queryKey: STATE_KEY });
      qc.invalidateQueries({ queryKey: ENERGY_KEY });
      // Раскладку игроков свой же шаг не меняет: сервер не кладёт в неё ни нас,
      // ни наши кошельки-сёстры (players.ts). Перечитывали её тут зря — это
      // четыре похода в БД на каждый маршрут. Чужие шаги по-прежнему приходят
      // живым потоком (useRaidLiveStream) и редким опросом.
      // Флот трогали — сверяемся с сервером один раз в конце: свои правки были
      // догадкой о том, что он и так сделал. Сухопутный маршрут причалы не
      // перечитывает вовсе (это несколько походов в БД на ровном месте).
      if (fleetMoved) qc.invalidateQueries({ queryKey: SHIPS_KEY });
      return done && !stopRef.current && lifetime.valid(token);
    } finally {
      setHeroRouteActive(false, routeVisualOwner);
      lifetime.finish();
      if (lifetime.mounted) setWalking(false);
    }
  };

  /** Показать маршрут с кнопкой «Идти»; сам собой гаснет через 5 секунд. */
  const offerPath = (path: Step[], action?: PendingAction | null) => {
    setPendingPath(path);
    setPendingAction(action ?? null);
    if (pendingTimer.current) clearTimeout(pendingTimer.current);
    pendingTimer.current = setTimeout(() => {
      setPendingPath(null);
      setPendingAction(null);
    }, 5000);
  };

  // Сам поиск — в routeSearch: обход дверей, а без обхода — сквозь них.
  const pathTo = (q: number, r: number): Step[] | null => routeTo(searchOpts(), q, r);

  /**
   * Клик по клетке — всегда предложение маршрута с ценой и кнопкой «Идти».
   * Соседняя клетка раньше шагалась сразу, без подтверждения: игрок не видел,
   * во сколько энергии обойдётся шаг, пока она не спишется.
   */
  /** Вернёт false, если маршрута нет: вызвавший решает, что сказать игроку. */
  const handleCellClick = (q: number, r: number): boolean => {
    if (walking) return false;
    const direct = opts.availableMoves.find((m) => m.q === q && m.r === r);
    if (direct) {
      offerPath([direct]);
      return true;
    }
    const path = pathTo(q, r);
    // path === [] — тапнули по своей же клетке; null — нет данных или пути (не
    // из-за размера судна — тогда «Нет подходящего корабля» скажет sayNeedBig).
    if (path == null) return sayNeedBig(opts, [{ q, r }], t);
    if (path.length === 0) return true;
    offerPath(path);
    return true;
  };

  /**
   * Тап по объекту, до которого ещё не дотянуться: по самой клетке объекта
   * не пройти, поэтому идём к ближайшей соседней с ним.
   */
  const approachCell = (
    q: number,
    r: number,
    action?: PendingAction | null,
    /** Чем объяснить отказ: у водной цели причина своя. */
    failKey = "braid.no_path",
    /** С любой стороны, и с берега: разбитое судно чинят вплотную откуда угодно. */
    anySide = false,
    /** Сразу идти, без плашки (лопата, 12.11.2026); дверь на пути — плашка, как walkTo. */
    go = false,
  ): Promise<boolean> | undefined => {
    if (walking) return;
    if (!opts.playerPos || !opts.cells || !terrains) return;
    // ОДИН поиск на все шесть подходов — approachRoute.
    const { goals, best } = approachRoute(searchOpts(), q, r, anySide);
    if (best && best.length > 0 && go && !pathCrossesDoor(best, opts.doors)) {
      clearPending();
      return moveAlongPath(best);
    }
    if (best && best.length > 0) offerPath(best, action);
    else if (!sayNeedBig(opts, goals, t)) toast.error(t(failKey));
  };

  /** Маршрут подхода без похода и плашки: окно рубки пишет цену дороги (13.11). */
  const approachPath = (q: number, r: number): Step[] | null =>
    approachRoute(searchOpts(), q, r).best;

  /**
   * Сразу пойти на клетку без предложения-маршрута с кнопкой «Идти».
   * Используется из окон построек — там владелец уже нажал «Идти сюда»,
   * второе подтверждение не нужно (жалоба 14.09: «идти сюда сразу
   * запускать должен переход, без дополнительных действий»).
   * Возвращает false, если пути нет: вызвавший скажет игроку.
   *
   * Исключение — дверь на пути (в том числе сама цель): плата списывается
   * шагом в неё, и идти молча нельзя. Тогда показываем маршрут с плашкой, где
   * рядом с энергией стоит цена ворот, — второе нажатие здесь осознанное.
   */
  const walkTo = async (q: number, r: number): Promise<boolean> => {
    if (walking) return false;
    if (!opts.playerPos || !opts.cells || !terrains) return false;
    const same = opts.playerPos.q === q && opts.playerPos.r === r;
    if (same) return true;
    const direct = opts.availableMoves.find((m) => m.q === q && m.r === r);
    const path = direct ? [direct] : pathTo(q, r);
    if (!path || path.length === 0) return false;
    if (pathCrossesDoor(path, opts.doors)) {
      offerPath(path);
      return true;
    }
    clearPending();
    return moveAlongPath(path);
  };

  return {
    pendingPath,
    pendingAction,
    /** Идём по маршруту — карта показывает это индикатором. */
    walking,
    /** Встать на месте: следующий шаг маршрута не уйдёт. */
    stopWalk: () => {
      stopRef.current = true;
      setHeroRouteActive(false, routeVisualOwner);
    },
    moveAlongPath,
    handleCellClick,
    walkTo,
    approachCell,
    approachPath,
    clearPending,
  };
}
