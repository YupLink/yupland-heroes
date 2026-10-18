// «Зелья скорости»: выпитое до журнала (аудит 14.10.2026). Строки «выпил»
// (drink-note) журнал пишет с 12.10.2026 12:26 UTC, а пили и раньше — с 24.09
// тысячи зелий. Учёт их не видел и считал, что они до сих пор лежат у игрока
// своими: выпитое в турнире снимало этот несуществующий запас первым, и до
// чужих долей (полка или мешочек твина) очередь не доходила: у acc_1-AzQ…
// числилось 6679 «своих» зелий, которых у него не было.
//
// Поэтому подтяжка дописывает в историю зелий выпитое до журнала — по
// записям бустов героя (hero_boost_op: ключ нажатия, герой, сколько пунктов,
// источник 'item:<канон>#…'), у которых нет строки журнала
// 'drink:<аккаунт>:<ключ>'. Аккаунт — хозяин героя (hero_instance). Штук —
// пункты буста / пункты одной штуки: сумма эффектов шаблона (диапазон —
// середина), а где сила менялась — прежняя (BOOST_UNIT_BEFORE). Строки
// раньше любого старта — очков не дают, только списывают штуки.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { parseBoostEffects } from "@/lib/hero/boost";
import { parseRange } from "@/server/api/beta-raid/abilities";
import type { Hist } from "@/server/api/tournament/tour-profit";

const ts = (ms: number): string => `to_timestamp(${ms} / 1000.0)`;

/** До этого мига «выпил» журнал не писал (первая строка — 12.10.2026 12:26 UTC). */
export const DRINK_JOURNAL_FROM = Date.UTC(2026, 9, 12, 12, 30);

/**
 * Прежняя сила буста одной штуки: до until — unit пунктов. «Дурман зелье» —
 * 10 до 02.10.2026 ~16:00 UTC (последний ключ не кратный 8 — 15:37, первый не
 * кратный 10 — 16:19), потом 8.
 */
export const BOOST_UNIT_BEFORE: Readonly<Record<string, { until: number; unit: number }>> = {
  cst_qq4aygtvckaa: { until: Date.UTC(2026, 9, 2, 16), unit: 10 },
};

/** Бусты своими товарами canons до журнала без строки «выпил»: кто, когда, сколько пунктов. */
export function preDrinkSql(canons: readonly string[]): string {
  const src = canons.map((c) => sqlStr(`item:${c}`)).join(", ");
  return `SELECT h.account_id, o.op, c.id AS canon, c.boost,
       extract(epoch from o.created_at) * 1000 AS at_ms, o.amount
  FROM yuplink.hero_boost_op o
  JOIN yuplink.hero_instance h ON h.id = o.hero_id
  JOIN yuplink.raid_custom_item c ON 'item:' || c.id = split_part(o.source, '#', 1)
 WHERE split_part(o.source, '#', 1) IN (${src})
   AND o.created_at < ${ts(DRINK_JOURNAL_FROM)}
   AND NOT EXISTS (SELECT 1 FROM yuplink.trade_journal j
                    WHERE j.source = 'drink' AND j.ref = 'drink:' || h.account_id || ':' || o.op)`;
}

/** Пунктов буста у одной штуки: сумма эффектов (диапазон — середина; иммунитет и забвение — мимо). */
export function boostUnit(raw: unknown): number {
  return parseBoostEffects(raw)
    .filter((e) => e.stat !== "immune" && e.stat !== "oblivion")
    .reduce((s, e) => {
      const [lo, hi] = parseRange(e.value);
      return s + (lo + hi) / 2;
    }, 0);
}

export type BoostOpRow = {
  account_id: string;
  op: string;
  canon: string;
  boost: unknown;
  at_ms: number | string;
  amount: number | string;
};

/** Бусты → строки «выпил» истории; keyOf — канон → ключ товара журнала. */
export function preDrinkRows(
  ops: readonly BoostOpRow[],
  keyOf: ReadonlyMap<string, string>,
): Hist[] {
  const out: Hist[] = [];
  for (const o of ops) {
    const key = keyOf.get(o.canon);
    const at = Number(o.at_ms);
    const was = BOOST_UNIT_BEFORE[o.canon];
    const unit = was && at < was.until ? was.unit : boostUnit(o.boost);
    const amount = Number(o.amount) || 0;
    if (!key || !o.account_id || !(unit > 0) || !(amount > 0)) continue;
    out.push({
      id: `pre:${o.op}`,
      account_id: o.account_id,
      item_key: key,
      at_ms: at,
      source: "drink",
      side: "use",
      qty: Math.max(1, Math.round(amount / unit)),
      total: 0,
      price_cur: null,
      place: null,
      counterparty: "sink",
      ref: `drink:${o.account_id}:${o.op}`,
    });
  }
  return out;
}

/**
 * Выпитое до журнала для зелий keyOf (канон → ключ журнала). Сбой чтения
 * роняет подтяжку (следующий проход повторит): без этих строк очки, которые
 * пишутся раз, легли бы по несуществующему запасу.
 */
export async function preDrinkHist(keyOf: ReadonlyMap<string, string>): Promise<Hist[]> {
  if (keyOf.size === 0) return [];
  const ops = ((await mcpExec(preDrinkSql([...keyOf.keys()]), { wrapJson: true })) ??
    []) as BoostOpRow[];
  return preDrinkRows(ops, keyOf);
}
