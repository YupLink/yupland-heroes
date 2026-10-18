// Цены шага для одной карты и одного героя — и нижняя оценка остатка пути.
//
// Цены считает та же формула, что списывает энергию на сервере
// (shipRules.stepEnergyCost); здесь она прогоняется по карте один раз, чтобы
// поиск не пересчитывал её на каждый из десятков тысяч шагов.
//
// Оценка остатка обязана быть ДОПУСТИМОЙ: никогда не больше настоящего
// остатка. Только тогда найденный маршрут остаётся самым дешёвым — правило
// владельца «идём по цене, а не по числу ходов» этой оптимизацией не трогается
// вовсе. Но чем оценка ближе к правде, тем меньше клеток перебирает поиск.
//
// Раньше оценка была одна на всю карту: «шагов по прямой × самая дешёвая
// клетка справочника». Самая дешёвая на «Мире Альфа» — Небеса за 0.1, а гребок
// по воде стоит 3: на воде оценка занижала остаток в тридцать раз, и посреди
// моря A* вырождался в Дейкстру — фронт расходился кругом во все стороны.
// Теперь к оценке добавляется надбавка за шаги, которые заведомо будут
// морскими; доказательство — у rest().
import { stepEnergyCost } from "@/lib/shipRules";
import { hexDistance } from "./hexGeometry";
import { DIRS } from "./hexPassable";
import type { PathGrid } from "./pathGrid";

/** Предрасчёт цели: её вклад в оценку от узла к узлу не меняется. */
export type GoalBound = { q: number; r: number; run: number };

export type PathCosts = {
  /** Цена входа в клетку ногами (шаг по суше и сход на берег), по номеру. */
  land: Float64Array;
  /** Гребок по воде на обычном корабле — от типа воды не зависит. */
  sail: number;
  /** Гребок на БОЛЬШОМ корабле — дешевле. */
  sailBig: number;
  /** Посадка на свободное судно. */
  board: number;
  /** Оценка остатка от клетки до цели. Никогда не больше настоящего. */
  rest(q: number, r: number, goal: GoalBound): number;
  /** Цель → её предрасчёт (сколько морских шагов гарантированы в конце). */
  goalBound(q: number, r: number): GoalBound;
};

/** Потолок волны: дальше 255 шагов считать нечего — карта меньше. */
const FAR = 255;

type Entry = { slowExtra: number; stepDiscount: number; bigSail: boolean; costs: PathCosts };

const cache = new WeakMap<PathGrid, Entry>();

export function pathCosts(
  grid: PathGrid,
  slowExtra: number,
  stepDiscount: number,
  /** Гребок БОЛЬШИМ судном возможен: игрок уже на нём или маршрут может сесть
   *  на свободное большое. Его морской «пол» дешевле — иначе оценка остатка
   *  ЗАВЫСИЛА бы её, и «самый дешёвый» морской маршрут перестал бы им быть. */
  bigSail = false,
): PathCosts {
  const hit = cache.get(grid);
  if (
    hit &&
    hit.slowExtra === slowExtra &&
    hit.stepDiscount === stepDiscount &&
    hit.bigSail === bigSail
  )
    return hit.costs;
  const costs = build(grid, slowExtra, stepDiscount, bigSail);
  cache.set(grid, { slowExtra, stepDiscount, bigSail, costs });
  return costs;
}

/**
 * Волна «сколько шагов до клетки дешевле моря» по всей сетке карты.
 *
 * Идёт по решётке, а не по проходимым клеткам: дыры и преграды волну проводят,
 * потому что расстояние в оценке должно быть НЕ БОЛЬШЕ настоящего. Источники —
 * только клетки, в которые правда можно войти дешевле гребка; вода источником
 * не бывает никогда (в неё входят ровно за гребок или за посадку), а непроходимая
 * клетка — тем более: в неё не входят вовсе.
 */
function spread(grid: PathGrid, land: Float64Array, sea: number): Uint8Array {
  const run = new Uint8Array(grid.size).fill(FAR);
  const queue = new Int32Array(grid.size);
  const { cols, rows } = grid;
  let tail = 0;
  for (let i = 0; i < grid.size; i++) {
    if (!grid.walk[i] || grid.water[i] || land[i] >= sea) continue;
    run[i] = 0;
    queue[tail++] = i;
  }
  // Шесть соседей числами: в цикле по 150 000 итераций перебор объектов DIRS
  // заметен сам по себе.
  const dq = DIRS.map((d) => d.q);
  const dr = DIRS.map((d) => d.r);
  for (let head = 0; head < tail; head++) {
    const idx = queue[head];
    const next = run[idx] + 1;
    const x = (idx / rows) | 0;
    const y = idx - x * rows;
    for (let d = 0; d < 6; d++) {
      const nx = x + dq[d];
      const ny = y + dr[d];
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const ni = nx * rows + ny;
      if (run[ni] <= next) continue;
      run[ni] = next;
      queue[tail++] = ni;
    }
  }
  return run;
}

function build(
  grid: PathGrid,
  slowExtra: number,
  stepDiscount: number,
  bigSail: boolean,
): PathCosts {
  const sail = stepEnergyCost({ sailing: true, slowExtra });
  const sailBig = stepEnergyCost({ sailing: true, bigShip: true, slowExtra });
  const board = stepEnergyCost({ boarding: true, slowExtra });
  // В воду входят только гребком или посадкой — дешевле в неё не входят. На
  // большом корабле гребок дешевле, и «пол» оценки обязан это учесть — в том
  // числе когда на большое судно маршрут только ещё сядет с берега.
  const sea = Math.min(bigSail ? sailBig : sail, board);
  const priceOf = (cellCost: number) =>
    stepEnergyCost({ cellCost, slowExtra, heroStepDiscountPct: stepDiscount });

  // Цен у клеток десяток на всю карту (столько типов местности), поэтому
  // формула зовётся по РАЗЛИЧНЫМ ценам, а не по каждой из 16 384 клеток.
  const known = new Map<number, number>();
  const land = new Float64Array(grid.size);
  for (let i = 0; i < grid.size; i++) {
    const base = grid.base[i];
    let price = known.get(base);
    if (price === undefined) {
      price = priceOf(base);
      known.set(base, price);
    }
    land[i] = price;
  }
  // Самый дешёвый шаг вообще: цена дешевле дешёвой клетки не бывает, а море
  // держит свою планку. Скидка героя учтена — иначе оценка ЗАВЫСИЛА бы остаток
  // быстрому герою, и «самый дешёвый» маршрут перестал бы быть самым дешёвым.
  // Замедление тоже сидит в priceOf, под скидкой (правило 27.09): цена шага
  // по-прежнему растёт вместе с ценой клетки, так что минимум — у minBase.
  const minStep = Math.min(sea, priceOf(grid.minBase));
  const gap = sea - minStep;
  const run = spread(grid, land, sea);
  const runAt = (q: number, r: number) => {
    const idx = grid.slot(q, r);
    // Вне сетки надбавки нет: занизить оценку безопасно всегда.
    return idx < 0 ? 0 : run[idx];
  };

  return {
    land,
    sail,
    sailBig,
    board,
    goalBound: (q, r) => ({ q, r, run: runAt(q, r) }),
    /**
     * Почему оценка не завышает остаток (иначе «самый дешёвый» маршрут перестал
     * бы быть самым дешёвым).
     *
     * 1. Шагов до цели не меньше, чем гексов по прямой (dist), и каждый стоит
     *    хотя бы minStep — минимум по ценам входа во ВСЕ клетки карты, включая
     *    гребок. Отсюда первое слагаемое; прежняя оценка на этом и кончалась.
     * 2. Часть шагов заведомо морская. Пусть run(x) — сколько шагов по решётке
     *    от x до ближайшей клетки, вход в которую дешевле гребка. У соседей run
     *    отличается не больше чем на 1, поэтому первые run(x) − 1 шагов из x
     *    ведут в клетки, до которых дешёвое ещё не дотянулось: каждый такой шаг
     *    стоит не меньше моря. Симметрично с конца: последние run(цель) шагов
     *    входят в такие же клетки (сама цель тоже в счёт — в неё ведь шагают).
     *    Куски берутся с разных концов и вместе не длиннее маршрута, поэтому их
     *    сумма режется по dist.
     * 3. Итого: dist шагов по minStep, из них hard штук — по цене моря. Посреди
     *    воды hard = dist, и оценка вместо «0.1 за шаг» даёт честные 3.
     */
    rest: (q, r, goal) => {
      const dist = hexDistance(q, r, goal.q, goal.r);
      if (dist === 0) return 0;
      const hard = Math.min(dist, Math.max(0, runAt(q, r) - 1) + goal.run);
      return dist * minStep + hard * gap;
    },
  };
}
