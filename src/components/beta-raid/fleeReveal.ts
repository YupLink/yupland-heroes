// Куда убежал — то и видно: клетки побега открываются в тумане войны.
//
// Радиус обзора — две клетки (useFogOfWar.VISION_RADIUS). Гриб стоит вплотную
// и уходит на две — оказывается на дистанции три, а такая клетка часто ещё не
// разведана: канвас рисует её чёрной и объект на ней не рисует вовсе
// (betaCanvasDraw «!isSeen → fogTile»). Стрелка при этом показывает «в
// черноту», и гриб «исчезает на несколько секунд» — пока игрок не шагнёт
// ближе (по проду: 14–43 % двухклеточных побегов, медиана открытия 4,5 с).
//
// Игрок ВИДЕЛ, откуда объект убежал, — значит видел и куда: открываем
// промежуточную клетку и цель тех побегов, чья from лежит в его обзоре. Это
// постоянная разведка одной-двух клеток за радиусом (маска, localStorage,
// сервер) — так и задумано: увиденное не забывается.
import { hexDistance } from "./hexGeometry";
import { parseCellKey, type FleeMove } from "./applyFled";
import { revealFogCells } from "./fogReveal";
import { VISION_RADIUS } from "./useFogOfWar";

type Hex = { q: number; r: number };

/** Ключи клеток «q,r», которые побеги открыли игроку на клетке `me`. */
export function fleeRevealKeys(me: Hex | null | undefined, moves: FleeMove[], radius: number) {
  const keys: string[] = [];
  if (!me) return keys;
  for (const m of moves) {
    const from = parseCellKey(m.from);
    if (!from || hexDistance(me.q, me.r, from.q, from.r) > radius) continue;
    for (const key of [m.via, m.to]) if (key && parseCellKey(key)) keys.push(key);
  }
  return keys;
}

/** Открыть в тумане клетки побегов, которые игрок на клетке `me` видел. */
export function revealFled(me: Hex | null | undefined, moves: FleeMove[] | undefined): void {
  if (moves?.length) revealFogCells(fleeRevealKeys(me, moves, VISION_RADIUS));
}
