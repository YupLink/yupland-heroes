// Сколько у ОТКРЫТОЙ пачки подписки ещё лежит на кошельке. Корзину пачка
// списала при открытии, а монеты уходят по шагам: сделанный шаг («done») —
// деньги уже в сети или, для «map», уже в пуле карты; вычитать его надо,
// иначе ушедшее держится в резерве второй раз и «свободно» уходит в минус
// (03.10: обмен 28,4 USDT ушёл, а резерв всё ещё держал все 99,4).
// Шаг «sending» — исход неизвестен, держим с запасом, пока владелец не отметит.

const OPEN = `b.status IN ('running', 'failed')`;
const USD_BUCKETS = `('sub_usd', 'sub_usd_map', 'bank_usd')`;

const doneSum = (field: "amount" | "received", names: string) =>
  `COALESCE((SELECT sum((st->>'${field}')::numeric) FROM jsonb_array_elements(b.steps) st
              WHERE st->>'state' = 'done' AND st->>'name' IN ${names}), 0)`;

/**
 * Остаток токена самой пачки: сумма − сделанные шаги этим токеном.
 * $-пачки тратят USDT обменом и переводом разработчикам; DARAI-пачки — дуплом
 * и разработчиками. `where` — доп. условие на b (корзины, токен).
 */
export function batchTokenLeftSql(where: string): string {
  return `SELECT COALESCE(sum(GREATEST(0, b.amount - CASE WHEN b.bucket IN ${USD_BUCKETS}
              THEN ${doneSum("amount", "('swap', 'dev')")}
              ELSE ${doneSum("amount", "('burn', 'dev')")} END)), 0)
     FROM yuplink.money_batch b WHERE ${OPEN} AND ${where}`;
}

/** DARAI, пришедшие обменом открытой $-пачки и ещё не ушедшие в дупло или пул карты. */
export function batchSwappedDaraiLeftSql(): string {
  return `SELECT COALESCE(sum(GREATEST(0, ${doneSum("received", "('swap')")}
                                       - ${doneSum("amount", "('burn', 'map', 'bank')")})), 0)
     FROM yuplink.money_batch b WHERE ${OPEN} AND b.bucket IN ${USD_BUCKETS}`;
}
