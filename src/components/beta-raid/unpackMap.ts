// Разворачивание колоночной карты обратно в клетки.
// Сервер шлёт индексы (server/api/beta-raid/packCells.ts) — здесь один проход
// собирает привычный Record "q,r" → клетка, которым живут карта и поиск пути.
//
// Проход этот не бесплатный (замер: 6,1 мс на 16 384 клетки), а карту правит
// кисть режима бога — по клетке за нажатие. Поэтому разбор помнит предыдущий
// результат: если колонки пришли от него же (та же карта, точечная правка),
// новые клетки берутся из старых, а заново собираются только тронутые.
import { changedRows } from "./packedDelta";
import { buildGroupByIdx } from "./packedLookups";

export type PackedCells = {
  terrainIds: string[];
  roadIds: string[];
  objectIds: string[];
  decorationIds: string[];
  buildingIds: string[];
  q: number[];
  r: number[];
  t: number[];
  road: number[];
  obj: number[];
  dec: number[];
  bld: number[];
  defeated: number[];
  /**
   * Позиции клеток, где показанный объект — БЕГЛЕЦ (server runners.ts): он
   * стоит не в клетке, а в своём слое под её содержимым. Списком, как defeated:
   * беглецов на карте десятки, колонка на 16 384 клетки весила бы ~32 КБ.
   */
  runners: number[];
  /**
   * Позиции клеток под глухим туманом — списком индексов, как defeated.
   *
   * Колонкой на все 16 384 клетки признак весил бы ~32 КБ на каждый вход в
   * рейд ради зоны в пару сотен клеток; списком — ноль байт, пока купол
   * никуда не поставлен, и ~6 байт за накрытую клетку.
   */
  voidFog: number[];
  /**
   * Позиции клеток, на которых стоит РАТУША (server town-resolve.ts). Списком,
   * не колонкой: ратуш на карте единицы, а клиенту они нужны только чтобы
   * быстро отвечать «тапнули по самой ратуше» — детали окна города придут
   * отдельным запросом.
   */
  townHalls?: number[];
  /** Словарь id объединённых блоков (режим бога). Старый кэш — без поля. */
  groupIds?: string[];
  /** Тройки (индекс клетки, индекс блока в groupIds, масштаб %) — packCells. */
  groups?: number[];
};

export type Cell = {
  terrainId?: string;
  /**
   * Дорога клетки — она ОДНА. Ею же считается цена шага: сервер выбирает ту же
   * (helpers.cellMoveCost через map-roads.cellRoadId).
   */
  roadId?: string | null;
  objectId?: string;
  objectDefeated?: boolean;
  /**
   * Объект на клетке — беглец: он спрятался на ней, а не стоит в ней. Драться и
   * забирать его можно как обычно, но клетку он НЕ запирает (hexPassable) —
   * иначе гриб, севший в узком месте, закрыл бы проход, а обойти его нечем.
   */
  runner?: boolean;
  decorationId?: string | null;
  /** Постройка: облик зависит от текущего тира. */
  buildingId?: string | null;
  /**
   * Клетка под глухим туманом: стена для правил проходимости. У админа флага
   * НЕ будет вовсе (см. bypassVoid) — по ТЗ купол ему ничему не мешает.
   */
  voidFog?: boolean;
  /** На клетке стоит ратуша: её же координаты (из списка townHalls). */
  townHall?: { q: number; r: number };
  /** Клетка входит в объединённый блок (режим бога): id блока. */
  groupId?: string;
  /** Масштаб картинки блока (1 … 2); только вместе с groupId. */
  iconScale?: number;
};

/**
 * Клетки из колоночного ответа.
 *
 * `bypassVoid` — единственное место на клиенте, где снимается запрет купола.
 * Так сделано нарочно: флаг «а можно ли мне» тянулся бы через A*, соседей,
 * тап и доступные ходы (пять хуков и четыре чистые функции), и мимо одной
 * такой проверки уже проезжали. Здесь признак просто не появляется — и разом
 * замолкают маршрут, кружки шагов, тап и обе панели соседа.
 *
 * Подсветку зоны у админа это не отнимает: её кадр берёт отдельным набором
 * (voidKeys), который считается из того же ответа и флага клетки не касается.
 */
export function unpackCells(
  packed: PackedCells | null | undefined,
  bypassVoid = false,
): Record<string, Cell> {
  if (!packed) return {};
  const dead = new Set(packed.defeated);
  // ?? [] — карта из старого суточного кэша приезжает без этой колонки.
  const runners = new Set(packed.runners ?? []);
  // ?? [] — старый суточный кэш в localStorage приезжает без этой колонки.
  const dome = bypassVoid ? null : new Set(packed.voidFog ?? []);
  // Клетка-ратуша → её же координаты: по ним тап открывает окно города.
  const hallByIdx = new Map<number, { q: number; r: number }>();
  for (const i of packed.townHalls ?? []) hallByIdx.set(i, { q: packed.q[i], r: packed.r[i] });
  const groupByIdx = buildGroupByIdx(packed);

  // Мазок кистью меняет одну клетку из 16 384, а колонки после него общие с
  // прошлой картой (packedEdit) — значит и клетки можно взять прежние, переложив
  // только тронутые. Полный проход остаётся для всего остального: новая карта с
  // сервера, смена права на купол, слишком большая пачка правок.
  const from = last && last.bypass === bypassVoid ? last : null;
  const rows = from ? changedRows(from.packed, packed) : null;
  if (from && rows) {
    // Копия ключей циклом, а не {...spread}: замер на 16 384 клетках — 5,6 мс
    // против 9,2 мс, спред на объекте такого размера проигрывает вдвое.
    const cells: Record<string, Cell> = {};
    for (const k in from.cells) cells[k] = from.cells[k];
    const keys: string[] = [];
    for (const i of rows) {
      const key = `${packed.q[i]},${packed.r[i]}`;
      cells[key] = cellAt(packed, i, dead, dome, runners, hallByIdx, groupByIdx);
      keys.push(key);
    }
    remember(packed, bypassVoid, cells, { from: from.cells, keys });
    return cells;
  }

  const cells: Record<string, Cell> = {};
  for (let i = 0; i < packed.q.length; i++) {
    cells[`${packed.q[i]},${packed.r[i]}`] = cellAt(
      packed,
      i,
      dead,
      dome,
      runners,
      hallByIdx,
      groupByIdx,
    );
  }
  remember(packed, bypassVoid, cells, null);
  return cells;
}

/** Одна клетка из колонок. */
function cellAt(
  p: PackedCells,
  i: number,
  dead: Set<number>,
  dome: Set<number> | null,
  runners: Set<number>,
  hallByIdx: Map<number, { q: number; r: number }>,
  groupByIdx: Map<number, { id: string; scale: number }>,
): Cell {
  const cell: Cell = {};
  const t = p.t[i];
  if (t >= 0) cell.terrainId = p.terrainIds[t];
  const road = p.road[i];
  if (road >= 0) cell.roadId = p.roadIds[road];
  const obj = p.obj[i];
  if (obj >= 0) {
    cell.objectId = p.objectIds[obj];
    if (dead.has(i)) cell.objectDefeated = true;
    if (runners.has(i)) cell.runner = true;
  }
  const dec = p.dec[i];
  if (dec >= 0) cell.decorationId = p.decorationIds[dec];
  const bld = p.bld?.[i] ?? -1;
  if (bld >= 0) cell.buildingId = p.buildingIds?.[bld] ?? null;
  if (dome?.has(i)) cell.voidFog = true;
  const hall = hallByIdx.get(i);
  if (hall) cell.townHall = hall;
  const grp = groupByIdx.get(i);
  if (grp) {
    cell.groupId = grp.id;
    cell.iconScale = grp.scale;
  }
  return cell;
}

/** Прошлый разбор — от него отсчитывается следующий. */
let last: { packed: PackedCells; bypass: boolean; cells: Record<string, Cell> } | null = null;

/**
 * Чем новый набор клеток отличается от предыдущего. Нужен индексу отрисовки
 * (mapIndex): по нему он обновляет свои записи точечно вместо полной пересборки
 * с сортировкой. Нет записи — значит клетки собраны с нуля.
 */
const deltas = new WeakMap<Record<string, Cell>, { from: Record<string, Cell>; keys: string[] }>();

export function cellsDelta(
  cells: Record<string, Cell>,
): { from: Record<string, Cell>; keys: string[] } | null {
  return deltas.get(cells) ?? null;
}

function remember(
  packed: PackedCells,
  bypass: boolean,
  cells: Record<string, Cell>,
  delta: { from: Record<string, Cell>; keys: string[] } | null,
): void {
  last = { packed, bypass, cells };
  if (delta) deltas.set(cells, delta);
}

// Ключи "q,r" по колонкам вынесены в packedKeys.ts (лимит ≤250 строк на файл).
export { voidKeys, townHallKeys } from "./packedKeys";
