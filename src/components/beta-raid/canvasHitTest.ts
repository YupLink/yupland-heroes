// Куда попал палец: экранная точка → клетка гекс-карты.
//
// Вынесено из BetaRaidCanvas (правило ≤250 строк): чистый расчёт, который
// удобно проверять отдельно от жестов и рендера.
import { R, SQRT3, hexRound } from "./hexGeometry";

export function cellAtPoint(opts: {
  clientX: number;
  clientY: number;
  rect: DOMRect;
  offset: { x: number; y: number };
  scale: number;
  centerQ: number;
  c0q: number;
}): { q: number; r: number } {
  const { clientX, clientY, rect, offset, scale, centerQ, c0q } = opts;
  const W = rect.width;
  const H = rect.height;
  const mx = (clientX - rect.left - W / 2 - offset.x) / scale;
  const my = (clientY - rect.top - H / 2 - offset.y) / scale;
  const qf = ((SQRT3 / 3) * mx - (1 / 3) * my) / R + centerQ;
  const rf = ((2 / 3) * my) / R + c0q;
  return hexRound(qf, rf);
}
