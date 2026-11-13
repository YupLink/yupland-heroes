// Что делает тап по клетке карты.
//
// Одно правило на всё: рядом — сразу действие, далеко — предложение «дойти и
// сделать» с общей ценой, пусто — обычный ход. Вынесено из BetaRaidScreen,
// чтобы экран остался оркестратором (§13.6).
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useT } from "@/lib/i18n";
import { DIRS, isVoidCell, isWaterCell, isOceanCell } from "./usePathfinding";
import { farShipRefusalKey, isWreckOnly, refreshBerths, waterRefusalKey } from "./shipTapRefusal";
import type { TerrainInfo } from "./hexStepCost";
import { objectKind, objectAction } from "./objectKind";
import type { Cell } from "./unpackMap";
import type { PendingAction } from "./useBetaMovement";
import type { ShipMark } from "./useShips";
import { tapChest, type ChestTap } from "./chest/chestTap";

type ObjectInfo = {
  id: string;
  name: string;
  imageUrl: string | null;
  meta: unknown;
  kind: string | null;
};

export function useCellTap(opts: {
  cells: Record<string, Cell>;
  objects: Record<string, ObjectInfo> | undefined;
  playerPos: { q: number; r: number } | null;
  /** Корабли на воде: "q,r" → занят ли, мой ли. */
  ships: Map<string, ShipMark>;
  /** Типы местности — по ним отличаем воду от берега. */
  terrains: Record<string, TerrainInfo>;
  /** Игрок за штурвалом: тогда вода проходима. */
  onShip: boolean;
  openShip: (ship: { q: number; r: number; mark: ShipMark }) => void;
  interact: (obj: { id: string; meta: unknown; kind: string | null; q: number; r: number }) => void;
  openBuilding: (cell: { q: number; r: number }) => void;
  /** Вышки, с которых игрок УЖЕ смотрел («q:r»): по ним просто ходим. */
  towerUsed?: Set<string>;
  approachCell: (
    q: number,
    r: number,
    action?: PendingAction | null,
    /** Чем объяснить отказ: у цели на воде причина своя. */
    failKey?: string,
    anySide?: boolean,
  ) => void;
  /** Предложить маршрут; false — пути нет, тогда отказ формулирует вызвавший. */
  handleCellClick: (q: number, r: number) => boolean;
  /**
   * Герой идёт по маршруту: handleCellClick тогда отвечает false без поиска, и
   * это не «нет пути» — молчим, как на тапе по суше, а не пугаем «не добраться».
   */
  walking?: boolean;
  /** Декор со «взаимодействием» (useDecorInteract): true — тап обработан. */
  decorTap?: (q: number, r: number, cell: Cell | undefined) => boolean;
  /** Магические сундуки: тап по ним важнее декора и города (chest/chestTap). */
  chest?: ChestTap;
}) {
  const t = useT();
  const qc = useQueryClient();
  const {
    cells,
    objects,
    playerPos,
    ships,
    onShip,
    openShip,
    interact,
    openBuilding,
    approachCell,
    handleCellClick,
  } = opts;
  const towerUsed = opts.towerUsed;
  // Словарь нужен только воде: купол живёт флагом на самой клетке.
  const terrains = opts.terrains;

  /** Цена самого взаимодействия — она входит в общий счёт «дойти и забрать». */
  const interactionCostOf = (meta: unknown): number => {
    const raw = (meta as { interactionCost?: unknown } | null)?.interactionCost;
    const n = typeof raw === "number" ? raw : Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 10;
  };

  /**
   * Тап по карте — единственное управление: пустая клетка ведёт героя,
   * клетка с объектом рядом сразу открывает бой/сбор, а дальняя — предлагает
   * «дойти и забрать» одним действием, с общей ценой.
   */
  const onCanvasCell = (q: number, r: number) => {
    const cell = cells[`${q},${r}`] as Cell | undefined;
    /** Живой объект на этой клетке — он же спрятавшийся под постройкой беглец. */
    const objectHere = () =>
      cell?.objectId && !cell.objectDefeated ? objects?.[cell.objectId] : undefined;
    // Глухой туман проверяем ПЕРВЫМ — раньше корабля, постройки и объекта.
    // Ниже проверять поздно: ветки выше уходят из обработчика по return, и
    // постройка в тумане открывала окно стройки, а корабль — окно посадки.
    // Штатно сюда не попасть (клетка вырезана из разведанного), но карта
    // живёт в кэше до пяти минут: пока она не обновилась, честнее сказать
    // «нельзя», чем молча проглотить тап.
    // Исключение — клетка под ногами: если игрока накрыли туманом уже стоящим
    // (на своём судне посреди воды), запрет на тап отнял бы у него «сойти на
    // берег». Уйти оттуда можно, войти обратно — нет.
    const underfoot = playerPos?.q === q && playerPos?.r === r;
    if (!underfoot && isVoidCell(cell)) {
      toast.error(t("braid.void_blocked"));
      return;
    }
    // Корабль: рядом (или под ногами) — окно с посадкой; издалека тап ведёт
    // героя к нему обычным маршрутом, а окно откроется следующим тапом.
    const mark = ships.get(`${q},${r}`);
    if (mark && playerPos) {
      const nearShip =
        (playerPos.q === q && playerPos.r === r) ||
        DIRS.some((d) => playerPos.q + d.q === q && playerPos.r + d.r === r);
      if (nearShip) {
        openShip({ q, r, mark });
        return;
      }
      // Разбитый: подбитый динамитом — окно издалека (таймер), прочий — подойти и чинить (12.10).
      if (isWreckOnly(mark) && (mark.blasted ?? 0) >= mark.broken) return openShip({ q, r, mark });
      if (isWreckOnly(mark)) {
        approachCell(q, r, { kind: "ship", q, r, extraCost: 0 }, farShipRefusalKey(mark), true);
        return;
      }
      // Издалека тап ведёт героя к судну обычным маршрутом. Раньше при отказе
      // поиска обработчик молчал, и тап по кораблю посреди моря выглядел как
      // сломанная кнопка — теперь говорим, в чём дело. Отказ идёт из кэша
      // причалов, а он бывает протухшим (shipTapRefusal) — перечитываем.
      if (!handleCellClick(q, r) && !opts.walking) {
        refreshBerths(qc);
        toast.error(t(farShipRefusalKey(mark)));
      }
      return;
    }
    // Океан — глубокая вода: обычному кораблю туда нельзя. Клетки с судном уже
    // разобраны выше (окно посадки в большой корабль стоит на клетке). Осталась
    // пустая глубокая вода — плывущему на малом честно говорим, в чём дело.
    if (isOceanCell(cell, terrains) && onShip && playerPos) {
      const aboardBig = ships.get(`${playerPos.q},${playerPos.r}`)?.mineBig ?? false;
      if (!aboardBig) {
        toast.error(t("braid.ship_too_small"));
        return;
      }
    }
    // Клетка города — обычная клетка: ратуша открывается как постройка (справка
    // о городе), лавки — своими окнами (владелец, 03.10.2026). Сундук — chestTap.
    if (!objectHere() && !cell?.buildingId && tapChest(opts.chest, playerPos, approachCell, q, r))
      return;
    if (opts.decorTap?.(q, r, cell)) return;
    // Постройка: подойти вплотную и построить следующий тир.
    //
    // Но СНАЧАЛА тот, кто на клетке стоит. Убегающий объект прячется за тем,
    // что на клетке уже есть, и под постройкой прятался безнаказанно: тап
    // открывал стройку, а до гриба добраться было нечем («мухоморы если
    // прячутся в постройку, то их не забрать»). Разобрался с грибом — постройка
    // снова открывается обычным нажатием. Стоишь на самой постройке — окно
    // постройки (вход в портал): иначе тап уводил с клетки к беглецу, а у
    // портала среди воды отходить некуда — «Туда не пройти» (жалоба 21.10).
    const onIt = playerPos?.q === q && playerPos?.r === r;
    if (cell?.buildingId && objectHere() && playerPos && !onIt) {
      const adjacent = DIRS.some((d) => playerPos.q + d.q === q && playerPos.r + d.r === r);
      const obj = objectHere()!;
      if (adjacent) {
        interact({ id: obj.id, meta: obj.meta, kind: obj.kind ?? null, q, r });
        return;
      }
      const action = objectAction(objectKind(obj.id, obj.meta, obj.kind ?? null), obj.meta, t);
      approachCell(q, r, {
        kind: action.opensBattle ? "battle" : "collect",
        q,
        r,
        extraCost: action.opensBattle ? 0 : interactionCostOf(obj.meta),
      });
      return;
    }
    // Отработавшая вышка — уже не постройка, а просто клетка. Пока окно
    // открывалось и после разведки, игрок не мог на неё зайти: тап показывал
    // «уже смотрел», и герой оставался на месте.
    const towerDone = !!towerUsed?.has(`${q}:${r}`);
    if (cell?.buildingId && playerPos && !towerDone) {
      // «Рядом» — это и СВОЯ клетка: стоя на портале, игрока заставляли
      // отойти на шаг и вернуться, хотя сервер пускает и с нуля. Так же
      // ведёт себя корабль под ногами.
      const here = playerPos.q === q && playerPos.r === r;
      const adjacent = here || DIRS.some((d) => playerPos.q + d.q === q && playerPos.r + d.r === r);
      if (adjacent) {
        openBuilding({ q, r });
        return;
      }
      approachCell(q, r, { kind: "build", q, r, extraCost: 0 });
      return;
    }
    // Пешком по воде не ходят — но маршрут туда может и найтись: поиск умеет
    // сойти на берег, дойти до свободного судна и сесть на него. Поэтому
    // сначала пробуем проложить путь и только потом отказываем.
    if (!onShip && isWaterCell(cell, terrains)) {
      // На воде стоит цель — ведём не в саму клетку (она занята), а к соседней
      // ВОДНОЙ: маршрут сам найдёт корабль и посадит на него. Бой с берега по
      // плавающему боссу сервер всё равно не примет.
      const swimTo = objectHere();
      if (swimTo && playerPos) {
        const act = objectAction(
          objectKind(swimTo.id, swimTo.meta, swimTo.kind ?? null),
          swimTo.meta,
          t,
        );
        approachCell(
          q,
          r,
          {
            kind: act.opensBattle ? "battle" : "collect",
            q,
            r,
            extraCost: act.opensBattle ? 0 : interactionCostOf(swimTo.meta),
          },
          "braid.water_target_only",
        );
        return;
      }
      if (handleCellClick(q, r) || opts.walking) return;
      // Маршрута нет — но «нет» сказал кэш причалов, а он после своего же схода
      // с борта ещё держал судно занятым (shipTapRefusal): перечитываем.
      refreshBerths(qc);
      toast.error(t(waterRefusalKey(ships)));
      return;
    }
    const obj = objectHere();
    if (obj && playerPos) {
      const adjacent = DIRS.some((d) => playerPos.q + d.q === q && playerPos.r + d.r === r);
      if (adjacent) {
        interact({ id: obj.id, meta: obj.meta, kind: obj.kind ?? null, q, r });
        return;
      }
      // Дальний объект: одно подтверждение на «дойти + забрать».
      const action = objectAction(objectKind(obj.id, obj.meta, obj.kind ?? null), obj.meta, t);
      approachCell(q, r, {
        kind: action.opensBattle ? "battle" : "collect",
        q,
        r,
        extraCost: action.opensBattle ? 0 : interactionCostOf(obj.meta),
      });
      return;
    }
    handleCellClick(q, r);
  };

  return onCanvasCell;
}
