// Правила побега: куда объект отходит от подошедшего игрока.
//
// Чистый расчёт, без базы, — его можно прогнать в тесте, и он один на все
// случаи: и на побег с клетки, и на побег из слоя беглецов.
//
// ПРАВИЛО ОДНО, И ОНО КОРОТКОЕ. Игрок встал рядом (вплотную или прямо на
// клетку) — объект отбегает на ОДНУ ИЛИ ДВЕ клетки, как выйдет. Каждый раз:
// ни отдыха, ни шансов пропустить, ни задержек — подошёл, побежал.
//
// Почему не всегда на две: игрок делает несколько шагов подряд, и объект,
// уходящий на две каждый раз, за три шага оказывается за шесть клеток — со
// стороны это «они по пять клеток скачут». На одну-две догнать можно, но
// повозиться придётся, а этого и хотели.
//
// Запреты — физические. В воду не заходит и сквозь преграду не проходит: ни
// через декор (им на карте выложены непроходимые зоны), ни через глухой туман,
// ни за край карты. Встать на клетку, где уже стоит босс, сундук, монетка или
// постройка, МОЖНО — там объект прячется ЗА ними (слой беглецов, flee-sql;
// владелец 21.09: «могут прятаться под боссом/сундуком/постройкой»). А вот
// ПРОБЕЖАТЬ СКВОЗЬ живой объект на промежуточной клетке — нельзя: это и
// читалось как «перепрыгнул препятствие». Отсюда два предиката: canStand —
// куда можно встать, canPass — сквозь что можно пройти. Что считать тем и
// другим, решает разведка (flee-sql), здесь — только геометрия. Некуда —
// остаётся и принимает бой (null).
//
// ПОЧЕМУ ТРИГГЕР — ЧУЖОЙ ШАГ, А НЕ ТАЙМЕР. По таймеру гриб уползал бы у всех на
// глазах без причины, а сервер платил бы кроном за 16 384 клетки каждую минуту.
// От шага расход нулевой, пока рядом никого нет.

/** Дальше этого объект за один побег не уходит. */
export const FLEE_STEPS = 2;

/**
 * Сколько клеток пробежать в этот раз: одну или две, поровну.
 *
 * Живёт отдельной функцией, чтобы расчёт побега (pickFleeCell) оставался
 * чистым: случайность решает вызывающий, а правила — нет.
 */
export function rollFleeSteps(): number {
  return 1 + Math.floor(Math.random() * FLEE_STEPS);
}

/** Клетка карты. */
export type Hex = { q: number; r: number };

/** Соседи гекса (axial, тот же порядок, что в helpers.getNeighbors). */
export const FLEE_DIRS: readonly Hex[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

/** Расстояние между гексами (копия helpers.hexDistance — без импорта БД). */
export function hexDist(a: Hex, b: Hex): number {
  return (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;
}

export const cellKey = (h: Hex): string => `${h.q},${h.r}`;

/** Клетки в радиусе `radius` от центра — ими же спрашивается проходимость. */
export function hexesWithin(center: Hex, radius: number): Hex[] {
  const out: Hex[] = [];
  for (let dq = -radius; dq <= radius; dq++) {
    for (let dr = Math.max(-radius, -dq - radius); dr <= Math.min(radius, -dq + radius); dr++) {
      out.push({ q: center.q + dq, r: center.r + dr });
    }
  }
  return out;
}

/** Можно ли объекту встать на эту клетку (или пройти сквозь неё) — отвечает
 *  разведка (flee-sql). */
export type CanStand = (h: Hex) => boolean;

/** Куда бежать и через какую клетку: `via` — промежуточная при побеге на две,
 *  null при побеге на одну. Через неё клиент рисует ломаную стрелку, а запись
 *  (flee-sql.PASSAGE) проверяет проход ещё раз. */
export type FleePick = { to: Hex; via: Hex | null };

type Scored = { cell: Hex; via: Hex | null; away: number; safety: number };

/**
 * Насколько далеко ближайший ПОСТОРОННИЙ игрок. Карта общая, и объект, спасаясь
 * от одного, не должен запрыгивать под ноги другому. Это не запрет, а выбор
 * между равными: клетки одной удалённости от подошедшего сравниваются этим.
 */
function safetyOf(cell: Hex, players: Hex[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (const p of players) best = Math.min(best, hexDist(cell, p));
  return best;
}

/** Лучше ли новая клетка прежней. Строгое «>» держит выбор воспроизводимым. */
function better(a: Scored, best: Scored | null): boolean {
  if (!best) return true;
  if (a.away !== best.away) return a.away > best.away;
  return a.safety > best.safety;
}

/**
 * Куда убегать.
 *
 * `steps` — сколько клеток пробежать (одну или две, см. rollFleeSteps). Путь
 * идётся ПО КЛЕТКАМ: промежуточная проверяется на ПРОХОД (canPass), конечная —
 * на ПОСАДКУ (canStand). Сквозь скалу, глухой туман, воду и живой объект
 * объект не прыгает — ни на одну клетку, ни на две; а встать под живой объект
 * может (спрятаться). По умолчанию проход = посадка — для тестов и старых
 * вызовов.
 *
 * Из всех подходящих концов берём самый дальний от подошедшего, при равенстве —
 * самый дальний от остальных игроков.
 *
 * Некуда на две — уходим на одну: гриб в тупике отбегает настолько, насколько
 * может, а не встаёт столбом при первой же скале на пути.
 *
 * null — бежать некуда вовсе (загнали в угол): объект остаётся и принимает бой.
 */
export function pickFleeCell(
  from: Hex,
  scarer: Hex,
  canStand: CanStand,
  players: Hex[],
  steps: number = FLEE_STEPS,
  canPass: CanStand = canStand,
): FleePick | null {
  const start = hexDist(from, scarer);
  let best: Scored | null = null;
  let fallback: Scored | null = null;

  const want = Math.max(1, Math.min(FLEE_STEPS, Math.floor(steps)));

  for (const d1 of FLEE_DIRS) {
    const via = { q: from.q + d1.q, r: from.r + d1.r };
    const viaAway = hexDist(via, scarer);
    if (canStand(via) && viaAway > start) {
      const score = { cell: via, via: null, away: viaAway, safety: safetyOf(via, players) };
      // На одну — это и есть цель, когда выпала единица; при двойке — запасной
      // вариант на случай, если второй шаг сделать некуда.
      if (want === 1) {
        if (better(score, best)) best = score;
      } else if (better(score, fallback)) fallback = score;
    }
    // Промежуточная клетка обязана быть проходимой: объект по ней ИДЁТ, а не
    // перелетает. Без этой проверки он перепрыгивал бы скалу (или пробегал
    // сквозь босса), лишь бы клетка за ней была свободна.
    if (want < 2 || !canPass(via)) continue;
    for (const d2 of FLEE_DIRS) {
      const to = { q: via.q + d2.q, r: via.r + d2.r };
      // Шаг назад и топтание вокруг исходной клетки побегом не считаются.
      if (hexDist(to, from) !== 2) continue;
      if (!canStand(to)) continue;
      const away = hexDist(to, scarer);
      // Убегание обязано УВЕЛИЧИВАТЬ дистанцию, иначе гриб бегает по кругу.
      if (away <= start) continue;
      const score = { cell: to, via, away, safety: safetyOf(to, players) };
      if (better(score, best)) best = score;
    }
  }
  const pick = best ?? fallback;
  return pick ? { to: pick.cell, via: pick.via } : null;
}
