import { createRouteLifetime } from "./routeLifetime";
// Движение по гекс-карте: шаг, путь по маршруту, подтверждение маршрута.
// Вынесено из BetaRaidScreen — экран остаётся оркестратором (§13.6).
//
// Шаг рисуется сразу, не дожидаясь сервера: позиция и энергия ложатся в кэш
// оптимистично; судья — сервер, на его отказе позиция и маршрут откатываются.
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { announceToll } from "./gateToll";
import { approachesOf } from "./approaches";
import { pathCrossesDoor } from "./pathTolls";
import { routeTo, routeToAny, sayNeedBig } from "./routeSearch";
import type { PortalPrice } from "@/lib/portal";
import { moveBetaRaid } from "@/server/api/beta-raid";
import { DIRS, type ShipMap } from "./usePathfinding";
// Тип местности — из hexStepCost: там же живёт и цена шага по нему.
import { isOceanCell, isWaterCell, type TerrainInfo as Terrain } from "./hexStepCost";
import { stepSatietyCost } from "@/lib/hero/satiety";
import type { Cell } from "./unpackMap";
import { ENERGY_KEY } from "@/lib/hooks/useEnergy";
import { useT } from "@/lib/i18n";
import { serverErrorText } from "@/lib/serverErrorText";
import { applyFled, type FleeMove } from "./applyFled";
import { emitFlee } from "./fleeFlash";
import { revealFled } from "./fleeReveal";
import { makeStepCache, STATE_KEY } from "./stepCache";
import { SHIPS_KEY } from "./patchShipsCache";
import { makeRoutePilot } from "./routeFleet";

type Step = { q: number; r: number; cost: number };

/** Что произойдёт в конце маршрута. */
export type PendingAction = {
  kind: "collect" | "build" | "battle" | "decor" | "dig" | "ship";
  q: number;
  r: number;
  /** Цена самого действия — она входит в общий счёт на метке маршрута. */
  extraCost: number;
};

/** Столько же едет герой на карте — раньше шага не отправляем. */
const STEP_MS = 190;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function useBetaMovement(opts: {
  playerPos: { q: number; r: number } | null;
  cells: Record<string, Cell> | undefined;
  terrains: Record<string, Terrain> | undefined;
  /** Дороги: шаг по ним стоит свою цену, а не цену местности. */
  roads?: Record<string, Terrain> | undefined;
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
  /**
   * Клетки-двери: маршрут их обходит, пока есть обход; нет обхода — ведёт
   * сквозь, и плату показывает плашка (routeSearch). Списание — шагом в дверь.
   */
  doors?: ReadonlySet<string>;
  /** Двери-стены и для маршрута сквозь двери (pathTolls.hardDoorsOf). */
  hardDoors?: ReadonlySet<string>;
}) {
  const t = useT();
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
      lifetime.unmount();
      stopRef.current = true;
      if (pendingTimer.current) clearTimeout(pendingTimer.current);
    };
  }, []);

  /**
   * Один шаг: рисуем сразу, запрос идёт параллельно анимации.
   * Возвращает false, если сервер шаг не принял.
   */
  const sendStep = async (step: Step, big = false): Promise<boolean> => {
    const snapshot = cache.snapshot();
    cache.applyStep(
      step.q,
      step.r,
      step.cost,
      stepSatietyCost({ water: stepOnWater(step), ocean: stepOnOcean(step) }),
    );
    try {
      const [res] = await Promise.all([
        moveBetaRaid({ data: { q: step.q, r: step.r, ...(big ? { big } : {}) } }) as Promise<{
          remainingEnergy?: number;
          satiety?: { now: number; max: number; hungry: boolean } | null;
          fled?: FleeMove[];
          toll?: PortalPrice[];
        }>,
        sleep(STEP_MS),
      ]);
      if (typeof res?.remainingEnergy === "number") cache.applyServerEnergy(res.remainingEnergy);
      if (res?.satiety) cache.applyServerSatiety(res.satiety);
      // От нашего шага кто-то отбежал (server flee-move). Карту правим ЗДЕСЬ,
      // а не по живому потоку: сразу после шага экран решает, с чем игрок
      // взаимодействует, и решать он должен по уже переехавшей цели.
      applyFled(qc, res?.fled);
      // Вспышку показываем по СЫРОМУ списку побегов, а не по отфильтрованному
      // applyFled: беглец мог уйти из-под объекта под другой объект (не виден ни
      // до, ни после) — карта не меняется, но «куда убежал» показать всё равно надо.
      emitFlee(res?.fled);
      revealFled(step, res?.fled); // видел, откуда убежал, — видит и куда (fleeReveal)
      announceToll(qc, res?.toll, t);
      return true;
    } catch (e) {
      cache.rollback(snapshot);
      toast.error(serverErrorText(e, t, t("braid.move_failed")));
      return false;
    }
  };

  /** Вода ли клетка, куда ведёт шаг. */
  const stepOnWater = (step: Step): boolean =>
    isWaterCell(opts.cells?.[`${step.q},${step.r}`], terrains ?? {});
  /** Океан ли — шаг туда стоит герою больше сытости (lib/hero/satiety). */
  const stepOnOcean = (step: Step): boolean =>
    isOceanCell(opts.cells?.[`${step.q},${step.r}`], terrains ?? {});

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
  const moveAlongPath = async (path: Step[]): Promise<boolean> => {
    const token = lifetime.begin();
    if (token === null) return false;
    try {
      setWalking(true);
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
      for (const step of path) {
        // Нажали «стоп» — дальше не идём. Пройденное остаётся пройденным:
        // энергия за сделанные шаги уже списана честно.
        if (stopRef.current || !lifetime.valid(token)) {
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
        if (!(await sendStep(step, fleet.bigOnly))) {
          pilot.rollback(fleet.snapshot);
          done = false;
          break;
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
  const pathTo = (q: number, r: number): Step[] | null => routeTo(opts, q, r);

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
  ) => {
    if (walking) return;
    if (!opts.playerPos || !opts.cells || !terrains) return;
    // ОДИН поиск на все шесть подходов, а не шесть подряд.
    //
    // Раньше на каждого соседа цели запускался свой A* со своим потолком в
    // 20 000 узлов: тап по сундуку у воды разворачивал перебор шесть раз, и
    // пять результатов из шести тут же выбрасывались. Хуже всего было со
    // сторонами, куда пути нет вовсе (вода, скала, чужое судно) — такой поиск
    // не находит ничего, зато обходит всю достижимую карту.
    //
    // Мультицель выбирает по тому же признаку — по энергии: два шага по болоту
    // дороже трёх по дороге, и очередь по цене отдаёт сначала дешёвое.
    const goals = approachesOf(
      q,
      r,
      opts.doors,
      anySide ? undefined : (cq, cr) => isWaterCell(opts.cells?.[`${cq},${cr}`], terrains),
    );
    const best = routeToAny(opts, goals);
    if (best && best.length > 0) offerPath(best, action);
    else if (!sayNeedBig(opts, goals, t)) toast.error(t(failKey));
  };

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
    },
    moveAlongPath,
    handleCellClick,
    walkTo,
    approachCell,
    clearPending,
  };
}
