// Деньги покупки с ценой в $ (подписка, набор): куда ложится оплата —
// корзины журнала money_bucket_move и доля DARAI в пул карты (splitPayment).
//
// Кусок SQL встаёт в запрос самой покупки вслед за её строкой: каждая вставка
// идёт FROM <after>, поэтому нет строки покупки в этом запросе (повтор, деньги
// уже вернули, бронь не оплачена) — нет и денег в корзинах. Ключи строк — от
// id покупки: повтор ничего не удваивает (ON CONFLICT по ref).
import { sqlStr } from "../raid-shared";
import { splitPayment, type SubToken } from "@/lib/energySub";

export type MoneyOf = {
  /** CTE покупки, вслед за которой пишутся деньги: sub — подписка, o — набор. */
  after: string;
  /** id покупки — в id и ключах строк корзин и пула. */
  id: string;
  /** Префикс ключей: esub — подписка, kit — набор. */
  prefix: string;
  /** Заметка строки пула карты. */
  note: string;
  token: SubToken;
  amount: number;
};

/** «, moves AS (…), pool AS (…)» — пусто, если класть некуда. */
export function moneyCtes(m: MoneyOf): string {
  const lines = splitPayment(m.token, m.amount);
  const map = lines.find((l) => l.bucket === "map")?.amount ?? 0;
  const moves = lines
    .filter((l) => l.bucket !== "map" && l.amount > 0)
    .map(
      (l) =>
        `(${sqlStr(`mbm_${m.id}_${l.bucket}`)}, ${sqlStr(l.bucket)}, ${sqlStr(l.token)},
          ${l.amount.toFixed(8)}, ${sqlStr(`${m.prefix}:${m.id}:${l.bucket}`)})`,
    );
  const movesCte = moves.length
    ? `, moves AS (
  INSERT INTO yuplink.money_bucket_move (id, bucket, token, amount, kind, ref)
  SELECT v.id, v.bucket, v.token, v.amount::numeric, 'income', v.ref
    FROM ${m.after}, (VALUES ${moves.join(", ")}) AS v(id, bucket, token, amount, ref)
  ON CONFLICT (ref) DO NOTHING
  RETURNING 1
)`
    : "";
  const poolCte =
    map > 0
      ? `, pool AS (
  INSERT INTO yuplink.darai_pool_move (id, pool, kind, amount, ref, note, op_id)
  SELECT ${sqlStr(`dp_${m.id}`)}, 'map', 'player_spend', ${map.toFixed(8)},
         ${sqlStr(`${m.prefix}:${m.id}:map`)}, ${sqlStr(m.note)}, ${sqlStr(`${m.prefix}_${m.id}`)}
    FROM ${m.after}
  ON CONFLICT (ref) DO NOTHING
  RETURNING 1
)`
      : "";
  return movesCte + poolCte;
}
