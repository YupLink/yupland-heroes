// «Золото»: плата товаром за покупку в маркете — цена отданного едет в цену
// купленного.
//
// «Хлеб» за 6 золота + 3 «Пшеницы»: строка «купил» хлеба несёт только золото
// (6), а пшеница уходит строкой «заплатил» (ref '<ref покупки>:pay<i>:<k>',
// exchange-note). Пшеница, купленная за золото по 0,5, — тоже вложение: без
// переноса её цена пропадала, и продажа хлеба давала прибыль 10,14 − 6 вместо
// 10,14 − 6 − 1,5 (ревью 06.10: до ~1,4 тыс. лишних очков). Своё добытое и
// чужое ценой не являются — переносится только цена своего купленного за
// золото, снятая этой платой (goldProfit, PayLink).
//
// Расчёт идёт по каждому товару отдельно, поэтому проходов несколько: первый
// собирает цену каждой «заплатил», следующий добавляет её к своей «купил». Цепочка
// (пшеница сама куплена за зерно) сходится за пару проходов; больше MAX_PASSES
// не ходим.
import { goldProfitFlow, type FlowRow, type ProfitPoint } from "@/lib/tournament/goldProfit";

/** Хвост ref строки «заплатил» покупки в маркете. */
const PAY_TAIL = /:pay\d+:\d+$/;

/** ref покупки, за которую заплачено этой строкой; не плата покупки — null. */
export const buyRefOfPay = (ref: string): string | null =>
  PAY_TAIL.test(ref) ? ref.replace(PAY_TAIL, "") : null;

const MAX_PASSES = 4;
const EPS = 1e-9;

function same(a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>): boolean {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) if (!(Math.abs((b.get(k) ?? NaN) - v) < EPS)) return false;
  return true;
}

/**
 * Прибыль продаж за золото по всем товарам сразу (каждый список — вся история
 * одного товара), с переносом цены отданного товаром в цену купленного.
 */
export function linkedGoldProfit(
  items: Iterable<readonly FlowRow[]>,
  since: number,
  till: number,
): ProfitPoint[] {
  const lists = [...items];
  let extra = new Map<string, number>();
  let points: ProfitPoint[] = [];
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const paid = new Map<string, number>();
    points = lists.flatMap((l) => goldProfitFlow(l, since, till, { extra, paid }));
    const next = new Map<string, number>();
    for (const [ref, cost] of paid) {
      const buy = buyRefOfPay(ref);
      if (buy) next.set(buy, (next.get(buy) ?? 0) + cost);
    }
    if (same(next, extra)) break;
    extra = next;
  }
  return points;
}
