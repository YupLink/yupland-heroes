// Чем обеспечено то, что раскладка обещает игрокам.
//
// Разложить монету — не то же самое, что нарисовать число: живой объект держит
// её за собой, а забравший игрок унесёт на свой счёт и выведет. Поэтому КАЖДЫЙ
// токенный фонд сверяется со свободным остатком СВОЕЙ монеты, а не только
// Darai, как было сначала: USDT — реальные деньги, которые нельзя дочеканить.
//
// Считают свободное двое, и по-разному:
//  • Darai — пул карты (darai_pool_move): проект чеканит его сам, и мера тут не
//    кошелёк, а сколько в пул положили под раздачу;
//  • всё остальное — свободный остаток кошелька-плательщика (token-free-pool),
//    ровно то число, что админ видит полоской над картой.
//
// ЗДЕСЬ НИЧЕГО НЕ ЗАПРЕЩАЕТСЯ. Раньше нехватка роняла выполнение до первой
// записи; владелец это снял: ограничивать админа раздавать в «-» нельзя, он
// осознанный и следит сам. Пул карты и без нас уходит в минус свободно
// (map-darai-hold), и красное число над картой — повод пополнить коллекцию, а
// не запрет на выдачу. Наше дело — посчитать вслух и с числами.
//
// Исключение — USDT (владелец 16.10.2026, ПРАВИЛА §8.49а): живые деньги в минус не
// уходят никогда. Раскладка USDT сверх «свободно − запас» не идёт вовсе
// (assertScatterUsdt), и «свободно» для USDT здесь — уже за вычетом запаса.
import { poolTotals } from "../darai-pools-move";
import { freeTokenPool } from "../token-free-pool";
import { assertSpendableUsdt, spendableUsdt } from "../usdt-guard";
import { tokensOf } from "./scatter-report";
import type { ScatterShortfall } from "@/lib/raid/scatterPlan";
import type { ScatterDraft } from "./scatter-build";

const fmt = (n: number) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(n);

/** Пул карты держит расписки живых объектов — им и меряем Darai. */
const isDarai = (symbol: string) => symbol.toLowerCase() === "darai";

/** Свободно под раздачу; null — узнать не удалось (сеть не ответила). */
async function freeOf(symbol: string): Promise<number | null> {
  if (isDarai(symbol)) return (await poolTotals("map")).reserved;
  if (isUsdt(symbol)) return spendableUsdt();
  return (await freeTokenPool(symbol)).free;
}

const isUsdt = (symbol: string) => symbol.toLowerCase() === "usdt";

/** USDT сверх «свободно − запас» не раскладываем: отказ до любой записи. */
export async function assertScatterUsdt(drafts: ScatterDraft[]): Promise<void> {
  const usdt = tokensOf(drafts).find((t) => isUsdt(t.symbol))?.amount ?? 0;
  if (usdt > 0) await assertSpendableUsdt(usdt, "раскладка USDT");
}

/** Снимок остатков по монетам плана. Ключ — символ в нижнем регистре. */
export type FreeFunds = Map<string, number | null>;

/**
 * Снять остатки ДО записи.
 *
 * Позже уже поздно: размещение само закладывает номиналы в пул карты, и
 * остаток, прочитанный после него, покажет нашу же раздачу как чужую трату —
 * минус в отчёте удвоился бы.
 *
 * Остаток каждой монеты — свой поход (у токенов ещё и в сеть), поэтому все
 * сразу и параллельно: последовательно это секунды ожидания на кнопке.
 */
export async function readFreeFunds(drafts: ScatterDraft[]): Promise<FreeFunds> {
  const tokens = tokensOf(drafts).filter((t) => t.amount > 0);
  if (tokens.length === 0) return new Map();
  const free = await Promise.all(tokens.map((t) => freeOf(t.symbol)));
  return new Map(tokens.map((t, i) => [t.symbol.toLowerCase(), free[i] ?? null]));
}

/**
 * Сверить РАЗЛОЖЕННОЕ со снимком остатков.
 *
 * Считаем по заготовкам, которые реально встали, — тем же числам, что уйдут в
 * строку «На карту поступило»: пугать минусом на полный фонд, когда половине
 * объектов не хватило клеток, значит врать в обе стороны сразу.
 *
 * Неизвестный остаток (кошелёк не ответил) раздачу тем более не трогает: сеть
 * отваливается на минуту, а отказ по ней запер бы админа от любой раздачи с
 * токеном. Про слепую раздачу честно написано в примечаниях.
 */
export function fundCover(
  free: FreeFunds,
  placed: ScatterDraft[],
): { notes: string[]; short: ScatterShortfall[] } {
  const notes: string[] = [];
  const short: ScatterShortfall[] = [];

  for (const t of tokensOf(placed)) {
    if (t.amount <= 0) continue;
    const have = free.get(t.symbol.toLowerCase());
    if (have === undefined || have === null) {
      notes.push(
        `Остаток ${t.symbol} проверить не удалось — раскладка на ${fmt(t.amount)} ` +
          `пойдёт без сверки. Проверь кошелёк вручную`,
      );
      continue;
    }
    if (t.amount <= have) continue;
    short.push({
      symbol: t.symbol,
      source: isDarai(t.symbol) ? "pool" : "wallet",
      need: t.amount,
      free: have,
      // Копейки float-вычитания не должны рисовать «минус 3 799 999,9999999».
      gap: Math.round((t.amount - have) * 1e6) / 1e6,
    });
  }
  return { notes, short };
}
