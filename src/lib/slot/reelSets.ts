// Крайние наборы мягкой тяги (reelLevel.ts, владелец 09.11.2026) — веса символов БЕЗ
// «Бонуса»: его доля на каждом барабане всегда как в обычном наборе (reels.ts), поэтому
// бонус и супер-игра выпадают одинаково часто при любых барабанах. Подобраны точным
// расчётом (rtp.ts): линии холодного — 8 %, горячего — 120 % (обычный — 33 %). Между ними
// сетка из 101 набора (reelGrid.ts). Ни один символ не больше 40 % барабана.
import type { Weights } from "./reels";

type Rest = Omit<Weights, "bonus">;

/** Самый скупой край сетки: линии 8 %. */
export const COLD: Rest[] = [
  { bar1: 140, bar2: 6, bar3: 299, snail: 51, butterfly: 94, seven: 307, logo: 4, wild: 7 },
  { bar1: 45, bar2: 287, bar3: 5, snail: 418, butterfly: 77, seven: 48, logo: 174, wild: 3 },
  { bar1: 270, bar2: 384, bar3: 285, snail: 3, butterfly: 9, seven: 3, logo: 6, wild: 5 },
  { bar1: 295, bar2: 367, bar3: 3, snail: 46, butterfly: 4, seven: 48, logo: 174, wild: 4 },
  { bar1: 112, bar2: 3, bar3: 63, snail: 165, butterfly: 322, seven: 140, logo: 17, wild: 6 },
];

/** Самый щедрый край сетки: линии 120 %. */
export const HOT: Rest[] = [
  { bar1: 297, bar2: 64, bar3: 109, snail: 8, butterfly: 51, seven: 108, logo: 7, wild: 89 },
  { bar1: 218, bar2: 286, bar3: 64, snail: 234, butterfly: 32, seven: 4, logo: 20, wild: 30 },
  { bar1: 383, bar2: 351, bar3: 120, snail: 26, butterfly: 8, seven: 3, logo: 5, wild: 65 },
  { bar1: 345, bar2: 326, bar3: 4, snail: 41, butterfly: 21, seven: 12, logo: 49, wild: 49 },
  { bar1: 365, bar2: 86, bar3: 61, snail: 137, butterfly: 189, seven: 13, logo: 10, wild: 27 },
];
