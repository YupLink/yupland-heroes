// Корабль появляется на карте сразу, а не после переспроса списка.
//
// Раньше «спустить корабль» дёргало перезапрос причалов и клетки: полтора
// десятка походов в базу ради одной иконки. Тут та же правка делается прямо в
// кэше — сервер подтвердит своим чередом, а если откажет, правку откатываем.
//
// Тем же путём идут чужие суда из живого потока: событие приезжает с
// координатами (server/raidLive.ShipCellDelta), и сосед двигает иконку у себя,
// не запрашивая список причалов на каждый чужой гребок.
//
// И тем же путём — СВОЙ шаг по воде: плавание, сход на берег и посадка правят
// кэш ровно теми дельтами, что сервер публикует соседям (move-step.ts). Свой
// корабль больше не «дорисовывается» под героем по факту воды под ногами — он
// переезжает записью в кэше и только по воде.
import type { QueryClient } from "@tanstack/react-query";

/** Ключ списка причалов — один на всё приложение. */
export const SHIPS_KEY = ["beta-raid-ships"];

export type ShipsCell = {
  q: number;
  r: number;
  total: number;
  busy: number;
  free: number;
  mine: boolean;
  /** Есть ли на клетке большой корабль — карта рисует его своим артом. */
  big: boolean;
  /** Свободный целый БОЛЬШОЙ: посадка сядет в него, и только он открывает океан. */
  freeBig?: boolean;
  /** МОЁ судно на клетке — большое (для океана и цены гребка). */
  mineBig: boolean;
  /** Разбитых судов на клетке (запас хода кончился, экипаж сошёл). */
  broken: number;
  /** Запас хода видимого борта и его потолок — для полоски под кораблём. */
  hp: number;
  hpMax: number;
};

export type ShipsData = { ships: ShipsCell[] } | undefined;

/**
 * Насколько изменился флот на клетке. Форма та же, что у события с сервера.
 *
 * `mine` ставят ТОЛЬКО свои правки (посадка и сход через окно корабля): чужой
 * шаг на признак «это моё судно» не влияет, и с сервера он не приходит вовсе.
 */
export type ShipCellDelta = {
  q: number;
  r: number;
  ships?: number;
  busy?: number;
  mine?: boolean;
  /** Большой ли корабль приехал/появился на клетке (для арта). */
  big?: boolean;
  /** Приехавшее МОЁ судно — большое (свои правки; в потоке не приходит). */
  mineBig?: boolean;
  /**
   * Запас хода приехавшего борта — переносим его вместе с судном, иначе
   * полоска гасла бы на каждом гребке до ответа сервера. Точное число сервер
   * пришлёт следующим списком причалов.
   */
  hp?: number;
  hpMax?: number;
  /** Разбитых на клетке стало столько (абсолютное число, не дельта). */
  broken?: number;
};

/**
 * Пересчёт клетки после правки: занятых не больше, чем судов, и не меньше нуля.
 * Свободными считаем целые незанятые — разбитые стоят до починки.
 */
function withCounts(cell: ShipsCell, total: number, busy: number): ShipsCell {
  const t = Math.max(0, total);
  const b = Math.max(0, Math.min(t, busy));
  const broken = Math.max(0, Math.min(t - b, cell.broken));
  const free = Math.max(0, t - b - broken);
  return { ...cell, total: t, busy: b, broken, free, freeBig: !!cell.freeBig && free > 0 };
}

/**
 * Применить пачку изменений флота прямо в кэше причалов.
 *
 * Ссылку возвращаем прежнюю, если ничего не изменилось: список причалов
 * пересобирает свою карту по ссылке (useShips), и лишний новый массив стоил бы
 * перерисовки на пустом месте.
 */
export function applyShipDeltas(old: ShipsData, deltas: ShipCellDelta[]): ShipsData {
  if (!old) return old;
  let ships = old.ships;
  let changed = false;
  for (const d of deltas) {
    const dShips = d.ships ?? 0;
    const dBusy = d.busy ?? 0;
    if (!dShips && !dBusy && d.mine === undefined && d.big === undefined && d.mineBig === undefined)
      continue;
    const at = ships.findIndex((s) => s.q === d.q && s.r === d.r);
    // Клетки в кэше нет: судно там прибавилось — заводим, убавилось — нечего.
    if (at < 0 && dShips <= 0) continue;
    if (!changed) {
      ships = [...ships];
      changed = true;
    }
    if (at < 0) {
      const blank: ShipsCell = {
        q: d.q,
        r: d.r,
        total: 0,
        busy: 0,
        free: 0,
        mine: false,
        big: false,
        mineBig: false,
        broken: 0,
        hp: 0,
        hpMax: 0,
      };
      ships.push(
        withCounts(
          {
            ...blank,
            mine: d.mine ?? false,
            big: d.big ?? false,
            mineBig: d.mineBig ?? false,
            broken: d.broken ?? 0,
            hp: d.hp ?? 0,
            hpMax: d.hpMax ?? 0,
          },
          dShips,
          dBusy,
        ),
      );
      continue;
    }
    const s = ships[at];
    const next = withCounts(
      {
        ...s,
        mine: d.mine ?? s.mine,
        big: d.big ?? s.big,
        // Сели в большой — свободного большого могло не остаться: до ответа
        // сервера не обещаем (иначе маршрут снова позвал бы в океан на малом).
        freeBig: dBusy > 0 && d.big ? false : s.freeBig,
        mineBig: d.mineBig ?? s.mineBig,
        broken: d.broken ?? s.broken,
        hp: d.hp ?? s.hp,
        hpMax: d.hpMax ?? s.hpMax,
      },
      s.total + dShips,
      s.busy + dBusy,
    );
    if (next.total === 0) ships.splice(at, 1);
    else ships[at] = next;
  }
  return changed ? { ...old, ships } : old;
}

/** Прибавить или убрать одно судно на клетке. Занятость держат игроки — её не трогаем. */
export function patchShipsCache(old: ShipsData, q: number, r: number, delta: 1 | -1): ShipsData {
  return applyShipDeltas(old, [{ q, r, ships: delta }]);
}

const cellAt = (data: ShipsData, q: number, r: number): ShipsCell | undefined =>
  data?.ships.find((s) => s.q === q && s.r === r);

/** Сколько судов стоит на клетке по кэшу причалов. */
export function shipsAtCell(data: ShipsData, q: number, r: number): number {
  return cellAt(data, q, r)?.total ?? 0;
}

/**
 * Что стало с флотом после одного шага. Дельты — те же, что публикует сервер
 * (move-step.ts), поэтому и своя карта, и соседские сходятся на одном.
 *
 * Три случая и ни одного четвёртого: плывём — судно едет с капитаном по воде;
 * сошли на сушу — судно осталось у берега и снова свободно (по земле оно за
 * нами не идёт); шагнули на свободное — заняли его.
 */
export function stepFleetDeltas(o: {
  from: { q: number; r: number };
  to: { q: number; r: number };
  /** Игрок был за штурвалом ДО этого шага. */
  aboard: boolean;
  /** Целевая клетка — вода. */
  water: boolean;
  /** Шаг с берега на свободное судно. */
  boarding: boolean;
  /** Своё судно — большое: клетка прибытия обязана нести его арт. */
  big?: boolean;
  /** Запас хода своего борта — едет с ним на новую клетку. */
  hp?: number;
  hpMax?: number;
}): ShipCellDelta[] {
  const { from, to } = o;
  if (o.aboard && o.water) {
    return [
      { q: from.q, r: from.r, ships: -1, busy: -1, mine: false, mineBig: false },
      {
        q: to.q,
        r: to.r,
        ships: 1,
        busy: 1,
        mine: true,
        big: o.big,
        mineBig: o.big,
        hp: o.hp,
        hpMax: o.hpMax,
      },
    ];
  }
  if (o.aboard) return [{ q: from.q, r: from.r, busy: -1, mine: false, mineBig: false }];
  if (o.boarding) return [{ q: to.q, r: to.r, busy: 1, mine: true, big: o.big, mineBig: o.big }];
  return [];
}

/**
 * Кэш причалов под рукой: спросить, поправить, откатить.
 *
 * Читаем ИЗ КЭША, а не из снимка в пропсах: маршрут идёт шагами в асинхронном
 * цикле, и за это время судно на той стороне могут занять — живой поток кладёт
 * это сюда же. Замыкание на пропсах узнало бы новость только после перерисовки,
 * то есть уже потратив энергию.
 */
export function makeShipsCache(qc: QueryClient) {
  const read = () => qc.getQueryData(SHIPS_KEY) as ShipsData;
  return {
    /** Снимок «как было» — на случай отказа сервера. */
    snapshot: read,
    /** Сколько судов на клетке свободно — по последнему слову сервера. */
    freeAt: (q: number, r: number) => cellAt(read(), q, r)?.free ?? 0,
    /** Наше ли судно на клетке. Капитана назначает сервер, не координаты. */
    mineAt: (q: number, r: number) => cellAt(read(), q, r)?.mine === true,
    /** Свободный целый большой на клетке — в него сядет посадка (seatOnShip). */
    freeBigAt: (q: number, r: number) => cellAt(read(), q, r)?.freeBig === true,
    /** МОЁ судно на клетке — большое: точнее, чем freeBigAt, на смешанной клетке. */
    mineBigAt: (q: number, r: number) => cellAt(read(), q, r)?.mineBig === true,
    /** Запас хода видимого борта — переезжает вместе с судном. */
    hpAt: (q: number, r: number) => {
      const c = cellAt(read(), q, r);
      return { hp: c?.hp ?? 0, hpMax: c?.hpMax ?? 0 };
    },
    apply: (deltas: ShipCellDelta[]) => {
      if (deltas.length === 0) return;
      qc.setQueryData(SHIPS_KEY, (old: unknown) => applyShipDeltas(old as ShipsData, deltas));
    },
    restore: (snap: ShipsData) => {
      if (snap) qc.setQueryData(SHIPS_KEY, snap);
    },
  };
}
