// Объект убежал — переносим его на карте клиента, не перечитывая карту.
//
// Одно и то же нужно двум путям, и потому живёт отдельно:
//   • свой шаг спугнул соседа — переезд приезжает прямо в ответе шага
//     (useBetaMovement), и применить его надо ДО того, как экран решит, с чем
//     игрок взаимодействует;
//   • спугнул сосед — переезд приходит живым потоком (liveFled).
//
// Полное чтение карты тут не годится: это 16 384 клетки и секунды ожидания
// ради одной перепрыгнувшей клетки (patchMapCache).
//
// Убежавший объект живёт в слое беглецов (server runners.ts) и на карте
// показывается ТОЛЬКО там, где его ничто не закрывает: встал на клетку с живым
// сундуком — спрятался за ним и с карты пропал; сундук забрали — показался
// снова. Здесь ровно этот же выбор, что делает сервер (map-runners).
//
// Сервер шлёт с переездом ПРАВДУ обеих клеток (patches, flee-move): её кладём
// как есть. Угадывать по from/to пришлось бы там, где правда не прочиталась,
// и угадывание ломалось дважды: беглец, уходя из-под одноимённого верхнего,
// стирал верхний; два побега одного шага цепочкой (A под B, B дальше) прятали
// A до дельты «map». Запасной путь остался, но идёт в два прохода — сначала
// все уходы, потом все приходы, — чтобы порядок переездов в пачке ничего не
// решал.
import type { QueryClient } from "@tanstack/react-query";
import { applyCellPatches, readCellDetails, type CellPatch, type MapLike } from "./patchMapCache";

/** Переезд объекта: ключи клеток «q,r», как их шлёт сервер (flee-move). */
export type FleeMove = {
  from: string;
  to: string;
  objectId: string;
  /** Промежуточная клетка побега на две — для ломаной стрелки. */
  via?: string;
  /** Откуда ушёл: 0 — из клетки, 1 — из слоя беглецов. Для запасного пути. */
  layer?: 0 | 1;
  /** Правда клеток from/to из базы. Есть — угадывать нечего. */
  patches?: CellPatch[];
};

const MAP_KEY = ["beta-raid-map"];

/** Ключ клетки «q,r» → числа. Кривой ключ отбрасываем молча. */
export function parseCellKey(key: string | undefined): { q: number; r: number } | null {
  const [q, r] = String(key ?? "")
    .split(",")
    .map(Number);
  return Number.isFinite(q) && Number.isFinite(r) ? { q, r } : null;
}

/** Правда клетки уже и так лежит в кэше — класть её заново нечего. */
function same(map: MapLike, p: CellPatch): boolean {
  const cur = readCellDetails(map, p.q, p.r);
  return (
    (p.objectId === undefined || cur.objectId === p.objectId) &&
    (p.runner === undefined || cur.runner === p.runner) &&
    (p.alive === undefined || cur.defeated === !p.alive)
  );
}

/** Запасной путь без правды: уходы и приходы двумя проходами. */
function guess(map: MapLike, moves: FleeMove[]): { patches: CellPatch[]; fresh: FleeMove[] } {
  const patches: CellPatch[] = [];
  const fresh = new Set<FleeMove>();
  for (const m of moves) {
    const from = parseCellKey(m.from);
    if (!from) continue;
    const src = readCellDetails(map, from.q, from.r);
    // Уходит он только оттуда, где был виден. Из слоя (layer 1) уходит именно
    // беглец — одноимённый верхний объект клетки остаётся на месте.
    if (src.objectId === m.objectId && (m.layer !== 1 || src.runner)) {
      patches.push({ ...from, objectId: null, runner: false });
      fresh.add(m);
    }
  }
  // Приходы — на карту, где ушедшие уже ушли: клетка, освобождённая соседом в
  // той же пачке, для пришедшего свободна независимо от порядка переездов.
  const left = patches.length ? applyCellPatches(map, patches) : map;
  for (const m of moves) {
    const to = parseCellKey(m.to);
    if (!to) continue;
    const dst = readCellDetails(left, to.q, to.r);
    // Появляется только там, где его не закрывает живой объект клетки.
    if (dst.objectId === m.objectId && dst.runner) continue;
    if (!dst.objectId || dst.defeated) {
      patches.push({ ...to, objectId: m.objectId, runner: true, alive: true });
      fresh.add(m);
    }
  }
  return { patches, fresh: moves.filter((m) => fresh.has(m)) };
}

/**
 * Перенести объекты на карте в кэше.
 *
 * Возвращает переезды, которые и правда что-то поменяли НА ВИДУ. Пустой ответ —
 * это «показывать нечего»: свой шаг применяет переезд сразу, а следом тот же
 * побег приходит потоком; и точно так же молча проходит побег того, кто и до, и
 * после прятался за чужим объектом.
 */
export function applyFled(qc: QueryClient, moves: FleeMove[] | undefined): FleeMove[] {
  if (!moves?.length) return [];
  const map = qc.getQueryData(MAP_KEY) as MapLike;
  if (!map) return [];
  // Свежий — чья правда меняет хоть одну клетку; уже применённый (свой шаг,
  // а следом поток) не меняет ничего, и класть его заново незачем.
  const fresh = moves.filter(
    (m) => m.objectId && m.patches?.length && m.patches.some((p) => !same(map, p)),
  );
  const truth = fresh.flatMap((m) => m.patches ?? []);
  const rest = guess(
    map,
    moves.filter((m) => m.objectId && !m.patches?.length),
  );
  const patches = [...truth, ...rest.patches];
  if (!patches.length) return [];
  qc.setQueryData(MAP_KEY, (old: MapLike) => applyCellPatches(old, patches));
  return [...fresh, ...rest.fresh];
}

/**
 * «Добыто/убито» из живого канала — гасим клетки сразу, не дожидаясь дельты
 * карты «map»: если запись в журнал не удалась (мост к базе моргнул), объект
 * иначе висел бы у всех живым до следующей перекачки. «Мёртв» — состояние
 * монотонное, дельта потом подтвердит то же самое.
 *
 * `runner` — погас беглец (слой 1), иначе объект клетки. Беглец, уже открытый
 * на клетке (ответ удара или дельта успели раньше), от смерти объекта клетки
 * не гаснет: это другой объект, и он жив (markDefeated).
 */
export function applyDefeated(qc: QueryClient, cells: unknown[], runner = false): void {
  const keys: Array<{ q: number; r: number }> = [];
  for (const k of cells) {
    const c = typeof k === "string" ? parseCellKey(k) : null;
    if (c) keys.push(c);
  }
  if (keys.length === 0) return;
  qc.setQueryData(MAP_KEY, (old: MapLike | undefined) => {
    if (!old) return old;
    const patches: CellPatch[] = keys
      .filter((c) => runner || !readCellDetails(old, c.q, c.r).runner)
      .map((c) => ({ ...c, alive: false }));
    return patches.length ? applyCellPatches(old, patches) : old;
  });
}
