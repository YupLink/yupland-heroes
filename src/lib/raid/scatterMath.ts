// Математика «россыпи»: как фонд раскладывается по боссам, сундукам и монеткам
// и кому достаётся штучное (паки, артефакты).
//
// Здесь ТОЛЬКО чистые функции: ни БД, ни React, ни скрытого Math.random —
// генератор всегда приходит последним аргументом. Иначе раскладку не
// воспроизвести в тестах и не пересчитать спорную раздачу.
//
// Общий закон модуля: НИ ОДНА функция не выдаёт больше фонда. Это деньги игры:
// переплатить нельзя, недоплатить на копейку из-за округления вниз — можно.

import { MAX_PER_GROUP } from "./scatterPlan";

export type Rnd = () => number;

/** Копейки: деньги в проекте округляются до сотых (см. encounter-share.ts). */
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Сотых в единице. Внутри rollPiles считаем целыми — так нет дрейфа float. */
const UNIT = 100;

/**
 * Во сколько раз бросок [n/2, 2n] в среднем крупнее точки n: считать кучки
 * делением фонда на точку — заказать на четверть больше, чем фонд тянет.
 */
export const POINT_MEAN = 1.25;

/** Допуск сравнения сумм: складывать float безопаснее с запасом в 1e-9. */
const EPS = 1e-9;

/** Чужие данные приходят из админки: NaN, строки и Infinity гасим в ноль. */
const finite = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const total = (xs: number[]): number => xs.reduce((a, x) => a + x, 0);

/**
 * Бросок кубика, приведённый к [0, 1). Генератор — чужой код (сид из админки,
 * mock в тестах), поэтому мусор и выход за границы обрезаем здесь, а не в
 * каждой формуле.
 */
function unit(rnd: Rnd): number {
  const v = Number(rnd());
  if (!Number.isFinite(v) || v <= 0) return 0;
  return v < 1 ? v : 1 - Number.EPSILON;
}

/**
 * Округлить доли так, чтобы сумма осталась в фонде.
 *
 * Округление вверх способно перевалить за фонд на пол-копейки с каждой доли,
 * поэтому при переборе ужимаем ТОЧНЫЕ доли и округляем заново — обычно хватает
 * одного прохода. Если чужой округлитель за несколько проходов не сошёлся,
 * берём min(округлённое, точное): оно заведомо не больше точных долей, а те в
 * фонд уже влезают.
 */
function fitRounded(exact: number[], fund: number, round: (v: number) => number): number[] {
  let scaled = exact;
  for (let pass = 0; pass < 4; pass++) {
    const out = scaled.map((v) => Math.max(0, finite(round(v))));
    const sum = total(out);
    if (sum <= fund + EPS) return out;
    scaled = scaled.map((v) => (v * fund) / sum);
  }
  return exact.map((v) => Math.max(0, Math.min(finite(round(v)), v)));
}

/**
 * Раздать фонд по уровням: чем выше уровень, тем больше доля. Сумма ≤ fund.
 *
 * Схема владельца: цена уровня = фонд / сумма уровней; база босса = цена ×
 * уровень; итог = бросок в [0, 2 × база]. Матожидание броска равно базе, то
 * есть на большой выборке раздача сходится к пропорции уровней, а конкретные
 * боссы «богатеют» и «беднеют». Перебор по фонду ужимается пропорционально —
 * выше фонда выходить нельзя.
 *
 * Вырожденные случаи: пустые уровни → пустой массив; фонд ≤ 0 → нули; все
 * уровни нулевые → фонд делится поровну (сравнивать боссов не по чему, а
 * сжигать фонд незачем).
 */
export function splitFundByLevels(
  levels: number[],
  fund: number,
  opts?: { round?: (v: number) => number; rnd?: Rnd },
): number[] {
  const list = Array.isArray(levels) ? levels.map((l) => Math.max(0, finite(l))) : [];
  if (list.length === 0) return [];

  const round = opts?.round ?? round2;
  const rnd = opts?.rnd ?? Math.random;
  const pool = Math.max(0, finite(fund));
  if (pool <= 0) return list.map(() => 0);

  const levelsSum = total(list);
  const base =
    levelsSum > 0 ? list.map((l) => (pool * l) / levelsSum) : list.map(() => pool / list.length);

  const rolled = base.map((b) => 2 * b * unit(rnd));
  const rolledSum = total(rolled);
  const exact = rolledSum > pool ? rolled.map((v) => (v * pool) / rolledSum) : rolled;

  return fitRounded(exact, pool, round);
}

/**
 * Жеребьёвка «право кубика»: вернуть, сколько штук достаётся каждому из n
 * участников.
 *
 * Кубик кидается на ВСЕХ участников сразу, предметы уходят сверху вниз по
 * броску. Предметов больше, чем участников — идут по кругу: сначала всем по
 * одному, лишние достаются тем, у кого бросок выше. Раздача всегда ровно
 * `items` штук: недодать предмет так же плохо, как выдать лишний.
 *
 * Вызывать НА КАЖДОЕ поле награды отдельно (свой кубик на каждый вид пака и
 * каждую позицию артефакта) — так хотел владелец.
 */
export function raffleItems(participants: number, items: number, rnd: Rnd = Math.random): number[] {
  const n = Math.max(0, Math.floor(finite(participants)));
  if (n === 0) return [];

  const count = Math.max(0, Math.floor(finite(items)));
  const out = new Array<number>(n).fill(0);
  if (count === 0) return out;

  // Броски снимаем по порядку участников, ничью решает номер: при одном и том
  // же генераторе раздача обязана повторяться до предмета.
  const rolls = out.map(() => unit(rnd));
  const order = rolls.map((_, i) => i).sort((a, b) => rolls[b] - rolls[a] || a - b);

  const each = Math.floor(count / n);
  const extra = count % n;
  order.forEach((idx, rank) => {
    out[idx] = each + (rank < extra ? 1 : 0);
  });
  return out;
}

/** Настройки броска кучек. Генератор здесь же — как у splitFundByLevels. */
export type PileOpts = {
  rnd?: Rnd;
  /** Наименьший номинал вида награды: копейка у токенов, единица у штучного. */
  step?: number;
  /** «Среднее значение» из панели: бросок в [n/2, 2n]. 0 — считать от фонда. */
  point?: number | null;
};

/**
 * Номиналы кучек (монетки, сундуки): сумма ≤ fund, каждый ≤ cap, каждый ≥ step.
 * cap — потолок из шаблона, `step` — наименьший номинал ВИДА награды
 * (pileStep). Прежнее общее «не меньше 1» стоило раздачи целиком: фонд 250 USDT
 * при номинале шаблона 0,1 не давал ни одной кучки. Бросок идёт в [n/2, 2n], где
 * n — точка знаменателя из панели (`point`), матожидание броска 1,25n; точки нет
 * — берём такую, чтобы фонд разошёлся ровно. Фонд меньше шага, count = 0 или
 * потолок ниже шага → пустой массив, а кучек выходит МЕНЬШЕ заказанного, когда
 * фонд их все не тянет: длина массива — честный ответ «столько встанет».
 */
export function rollPiles(count: number, fund: number, cap: number, opts?: PileOpts): number[] {
  const rnd = opts?.rnd ?? Math.random;
  const want = Math.max(0, Math.floor(finite(count)));
  // Шаг он же наименьшая кучка; единица по умолчанию — прежнее поведение.
  const stepU = Math.max(1, Math.round(Math.max(0, finite(opts?.step ?? 1)) * UNIT));
  const poolU = Math.floor(Math.max(0, finite(fund)) * UNIT);
  // Потолок ≤ 0 в шаблоне читаем как «потолка нет»: админ поле не заполнил.
  const rawCap = finite(cap);
  const capU = rawCap > 0 ? Math.floor(rawCap * UNIT) : Infinity;
  if (want === 0 || poolU < stepU || capU < stepU) return [];

  // Всё считаем ПО СЕТКЕ шага: лайк и билет обязаны выйти целыми, а потолок
  // между узлами сетки округляем вниз — вверх нельзя.
  const grid = (v: number) => Math.round(v / stepU) * stepU;
  const capG = Math.floor(capU / stepU) * stepU;
  const fit = (v: number) => Math.min(Math.max(grid(v), stepU), capG);
  // Точка мельче наименьшего номинала — это всё равно он: дробить некуда.
  const rawPoint = Math.max(0, finite(opts?.point ?? 0)) * UNIT;
  const pointU = rawPoint > 0 ? Math.max(rawPoint, stepU) : 0;

  let n: number, loU: number, hiU: number;
  if (pointU > 0) {
    // Номинал держит админ, число кучек режет фонд: сколько влезло по среднему
    // броску, столько и встанет — остальные не встанут вовсе. Ёмкость считаем ДО
    // сетки: иначе она разойдётся с pileCountByPoint на лишнее округление, и
    // «посчитай сам» отчитывалось бы недостачей на ровном месте.
    const lo = Math.min(Math.max(pointU / 2, stepU), capG);
    const hi = Math.max(lo, Math.min(2 * pointU, capG));
    n = Math.min(want, Math.floor(poolU / ((lo + hi) / 2)));
    loU = fit(lo);
    hiU = Math.max(loU, fit(hi));
  } else {
    // Точки нет: кучек не больше, чем шагов в фонде (200 на фонде 50 — будет
    // 50), а саму точку берём такую, чтобы фонд разошёлся ровно.
    n = Math.min(want, Math.floor(poolU / stepU));
    const midU = n > 0 ? poolU / (n * POINT_MEAN) : 0;
    loU = fit(midU / 2);
    hiU = Math.max(loU, fit(2 * midU));
  }
  if (n <= 0) return [];
  // Оставшимся тоже нужно по нижней границе броска — больше этого брать нельзя,
  // иначе хвост раздачи уйдёт в минус и придётся отбирать уже выданное.
  const holdU = Math.min(loU, Math.floor(poolU / n / stepU) * stepU);
  const out: number[] = [];
  let leftU = poolU;
  for (let i = 0; i < n; i++) {
    const maxNowU = Math.floor((leftU - (n - i - 1) * holdU) / stepU) * stepU;
    const rollU = grid(loU + unit(rnd) * (hiU - loU));
    const pileU = Math.max(stepU, Math.min(rollU, maxNowU, capG));
    out.push(pileU / UNIT);
    leftU -= pileU;
  }
  return out;
}

/** Столько фонда идёт на одну кучку, когда число не задано руками. */
export const PILE_FUND_STEP = 10_000;

/**
 * Сколько кучек, если админ не задал число: fund / 10000, не меньше 1.
 *
 * Владелец: «1 млн = 1млн/10к = 100 монеток». Округляем вниз — лучше кучки
 * покрупнее, чем лишняя пылинка на карте. Фонда нет — раскладывать нечего.
 *
 * `cap` — потолок группы, и по умолчанию он стоит: верхняя граница фонда в
 * схеме 1e12, то есть без потолка «авто» просило бы сто миллионов заготовок и
 * роняло процесс ещё на кнопке «Посчитать». Отдельный `Infinity` передают
 * только затем, чтобы узнать, СКОЛЬКО вышло бы без потолка, — и сказать это
 * админу вслух.
 */
export function autoPileCount(fund: number, cap: number = MAX_PER_GROUP): number {
  const pool = Math.max(0, finite(fund));
  if (pool <= 0) return 0;
  const want = Math.max(1, Math.floor(pool / PILE_FUND_STEP));
  const top = Number(cap);
  return Number.isFinite(top) && top > 0 ? Math.min(want, Math.floor(top)) : want;
}

/**
 * Сколько кучек, когда админ задал ФОНД и ТОЧКУ: фонд / (1,25 × точку). Делить
 * на саму точку нельзя — бросок в среднем крупнее её на четверть, и последней
 * четверти кучек денег бы не досталось. Ноль законен: точка крупнее фонда —
 * «не хватает даже на одну», и поднимать ответ до единицы нечестно.
 */
export function pileCountByPoint(fund: number, point: number, cap: number = MAX_PER_GROUP): number {
  const pool = Math.max(0, finite(fund));
  const n = Math.max(0, finite(point));
  if (pool <= 0 || n <= 0) return 0;
  const want = Math.floor(pool / (POINT_MEAN * n));
  const top = Number(cap);
  return Number.isFinite(top) && top > 0 ? Math.min(want, Math.floor(top)) : want;
}
