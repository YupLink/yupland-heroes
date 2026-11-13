// Плата товаром за покупку в маркете (ревью 12.10.2026): «Дурман зелье»
// продаётся за «Обычную рыбу» и «Ведро воды» — строка «купил» несёт только
// первую цену, а товары уходят строками «заплатил» (ref '<ref покупки>:pay<i>:<k>',
// как у «Золота» — goldPayLink). Такая покупка — обмен, а не покупка за деньги
// (swaps): у «Продажи рыбы» выменянная рыба в «только в плюс» не идёт
// (владелец, 12.10.2026).
//
// У «Зелий скорости» обмен — тоже своё: сваренное самим — своё, чьи бы ни были
// рыба и вёдра (владелец, 14.10.2026). Было (ревью 12.10 — правило агента, не
// владельца): зелье своё в той доле, в какой плата снята со своего (buyOwn), —
// игрок варил «Дурман» сам, но на вёдрах и рыбе из мешочков другого
// аккаунта и терял все очки. Чужое ЗЕЛЬЕ (полка, сундук, мешочек, аукцион) —
// по-прежнему не своё (pieceFlow.ts).
import { buyRefOfPay } from "@/lib/tournament/goldPayLink";
import { pieceFlow, type PieceOpts, type PiecePoint } from "@/lib/tournament/pieceFlow";
import type { FlowRow } from "@/lib/tournament/flowAct";

/** ref покупок, за которые до till отдавали товар (строки «заплатил»). */
export function swapRefs(all: Iterable<readonly FlowRow[]>, till: number): Set<string> {
  const out = new Set<string>();
  for (const list of all) {
    for (const r of list) {
      // Как «заплатил» у pieceFlow: грабёж сундука — не плата, пустая строка — мимо.
      if (r.side !== "pay" || r.source === "chest_plunder" || !(r.at < till)) continue;
      const buy = Number(r.qty) > 0 ? buyRefOfPay(r.ref ?? "") : null;
      if (buy) out.add(buy);
    }
  }
  return out;
}

/**
 * Очки по товарам counted (каждый список — вся история одного товара); all —
 * все загруженные истории (и товары категории, и чем за них платили): по ним
 * узнаём, какие покупки — обмен.
 */
export function linkedPieces(
  counted: Iterable<readonly FlowRow[]>,
  all: Iterable<readonly FlowRow[]>,
  o: Omit<PieceOpts, "swaps">,
): PiecePoint[] {
  const swaps = swapRefs(all, o.till);
  return [...counted].flatMap((list) => pieceFlow(list, { ...o, swaps }));
}
