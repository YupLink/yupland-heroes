// Плата за запись на турнир — общее для записи (tour-entry.ts) и разбора
// зависших записей (tour-entry-settle.ts): ключ попытки, порядок строк цены,
// память процесса об исходе попыток, возврат и журнал сделок.
import { TOUR_FEE_KIND, TOUR_FEE_REFUND_KIND, type TourEntryPrice } from "@/lib/tournament/types";
import { hasTrail } from "./tour-entry-sql";

/**
 * Ключ платежа одной попытки записи. Свой у каждой попытки и второй раз не
 * платится: откаченный ключ списание не повторяет (res_move отвечает «уже
 * проведён», счёт токенов — ref_refunded), и запись по нему вышла бы даром.
 */
export const tourFeeRef = (id: string, account: string, nonce: string): string =>
  `tour:${id}:${account}:${nonce}`;

/**
 * Вид строк res_ledger: экономика считает tour_fee стоком (econ/kinds.ts).
 * keyed — энергия и товар тоже по ключу операции (resource-pay → pay-once):
 * слепой повтор моста их второй раз не спишет и не вернёт, а разбор зависшей
 * записи видит по ключу, списаны ли они.
 */
export const FEE_KINDS = { kind: TOUR_FEE_KIND, refundKind: TOUR_FEE_REFUND_KIND, keyed: true };

/**
 * Порядок оплаты: сначала строки, чьё списание видно по ключу (ресурсы,
 * билеты, токен, энергия, товар), потом лайки. Плата идёт по строкам подряд,
 * поэтому несписанная проверяемая строка доказывает, что до лайков очередь не
 * дошла. Ключ строки — её номер в ЭТОМ порядке: его держат и плата, и возврат,
 * и разбор зависшей записи.
 */
export function payOrder(price: readonly TourEntryPrice[]): TourEntryPrice[] {
  const real = price.filter((p) => Number(p.amount) > 0);
  return [...real.filter(hasTrail), ...real.filter((p) => !hasTrail(p))];
}

/**
 * Чем кончилась попытка в ЭТОМ процессе: «оплачено» (плата прошла, отметка не
 * легла) или «откачено» (плата сорвалась). Лайки по ключу не проверить —
 * разбор зависшей строки спрашивает здесь. Платёж и разбор обычно в одном
 * процессе; хватает последних записей.
 */
const outcomes = new Map<string, "paid" | "void">();
const OUTCOMES_MAX = 1000;

export function noteOutcome(ref: string, o: "paid" | "void"): void {
  outcomes.delete(ref);
  outcomes.set(ref, o);
  while (outcomes.size > OUTCOMES_MAX) outcomes.delete(outcomes.keys().next().value as string);
}

export const outcomeOf = (ref: string): "paid" | "void" | undefined => outcomes.get(ref);

/**
 * «Оплачено» → «возвращено» ровно один раз на процесс. Возврат проверяемых
 * строк идёт под ключом :back и повтором не удвоится, а лайки вернулись бы
 * второй раз — подарком.
 */
export function takePaid(ref: string): boolean {
  if (outcomes.get(ref) !== "paid") return false;
  outcomes.set(ref, "void");
  return true;
}

/** Вернуть выбранные строки цены попытки; остальные идут нулём и пропускаются. */
export async function refundLines(
  wallet: string,
  price: readonly TourEntryPrice[],
  ref: string,
  pick: (p: TourEntryPrice, i: number) => boolean,
): Promise<void> {
  const lines = price.map((p, i) => (pick(p, i) ? p : { ...p, amount: 0 }));
  if (!lines.some((p) => p.amount > 0)) return;
  const { refundResources } = await import("../beta-raid/resource-pay");
  await refundResources(wallet, lines, ref, FEE_KINDS);
}

export type FeePlace = { mapId: string; q: number; r: number };

/**
 * Плата прошла — в журнал сделок (вид 'tour', строка на строку цены; ключ
 * повтора тот же, что у платы) и энергия в причины трат. Без журнала товар,
 * отданный за запись, остался бы у игрока «купленным», и прибыль с продаж
 * (goldProfit) считалась бы не по правилу «плата товаром тратит купленное
 * первым». Best-effort: запись уже оплачена, сбой журнала её не отменяет.
 */
export function noteFee(
  o: { wallet: string; place?: FeePlace },
  prices: TourEntryPrice[],
  ref: string,
): void {
  if (!o.place || prices.length === 0) return;
  const place = o.place;
  void import("../beta-raid/econ/trade-hooks")
    .then((m) => m.notePricesPaid({ source: "tour", wallet: o.wallet, ...place, prices, ref }))
    .catch(() => undefined);
}
