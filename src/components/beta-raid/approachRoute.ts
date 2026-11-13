// Подход к цели, на которую не встать (объект, дерево, постройка): маршрут к
// ближайшей соседней клетке. Вынесено из useBetaMovement (лимит строк): этим же
// поиском окно рубки заранее считает цену дороги (13.11.2026).
//
// ОДИН поиск на все шесть подходов, а не шесть подряд. Раньше на каждого
// соседа цели запускался свой A* со своим потолком в 20 000 узлов: тап по
// сундуку у воды разворачивал перебор шесть раз, и пять результатов из шести
// тут же выбрасывались. Хуже всего было со сторонами, куда пути нет вовсе
// (вода, скала, чужое судно) — такой поиск не находит ничего, зато обходит всю
// достижимую карту.
//
// Мультицель выбирает по тому же признаку — по энергии: два шага по болоту
// дороже трёх по дороге, и очередь по цене отдаёт сначала дешёвое.
import { approachesOf } from "./approaches";
import { isWaterCell } from "./hexStepCost";
import { routeToAny, type RouteSearchOpts, type Step } from "./routeSearch";

/** anySide — с любой стороны, и с берега (разбитое судно чинят откуда угодно). */
export function approachRoute(
  o: RouteSearchOpts,
  q: number,
  r: number,
  anySide = false,
): { goals: Array<{ q: number; r: number }>; best: Step[] | null } {
  const terrains = o.terrains;
  const goals = approachesOf(
    q,
    r,
    o.doors,
    anySide || !terrains ? undefined : (cq, cr) => isWaterCell(o.cells?.[`${cq},${cr}`], terrains),
  );
  return { goals, best: routeToAny(o, goals) };
}
