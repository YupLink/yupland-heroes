// Аукционный дом игроков в штучном учёте турнира рыбаков (ревью 14.10.2026):
// выставленный товар уходит из рюкзака продавца в залог, а выигранный
// приходит победителю подарком (game-auction/escrow.ts, settle.ts →
// gifts-deliver) — журнал сделок (trade_journal) не пишет ни того, ни другого.
// Без этих строк у победителя товар — «сверх журнала», а у «Зелий скорости»
// это своё (pieceFlow.ts: POTION_DRINK_RULE): зелье твина, купленное на
// аукционе и выпитое, давало бы очки.
//
// Поэтому подтяжка сама дописывает в историю товара строки аукциона — как
// мешочек на отдельной «клетке» лота (flowAct.ts, loot_bag, место 'auc:<лот>'):
//  • продавец положил — когда выставил (залог взят: есть ключ списания
//    'pay:gauclot:<лот>', escrow.takeEscrow);
//  • продавец забрал назад — когда залог вернули (снят, не продан, не вышел в
//    торги: item_returned);
//  • победитель забрал у продавца (контрагент) — когда забрал подарок
//    (player_gift 'gaucwin:<лот>:<ставка>', claimed_at).
// У победителя штуки остаются продавца: полученное от другого аккаунта — не
// своё (владелец, 14.10.2026), как полка и мешочек. «Золото» этих строк не
// видит: они только здесь.
import { mcpExec } from "@/server/db/mcpClient";
import { marketKeysCanon } from "@/server/api/beta-raid/econ/canon-key";
import type { Hist } from "@/server/api/tournament/tour-profit";

const ts = (ms: number): string => `to_timestamp(${ms} / 1000.0)`;

/** Лоты товаров с взятым залогом до till: продавец, возврат, забранные выигрыши. */
export function auctionSql(till: number): string {
  return `SELECT a.id, a.seller_account_id AS seller, a.prize_qty AS qty, c.id AS item_id, c.name,
       extract(epoch from a.created_at) * 1000 AS put_ms,
       CASE WHEN a.item_returned
            THEN extract(epoch from COALESCE(a.closed_at, a.created_at)) * 1000 END AS back_ms,
       g.account_id AS winner, g.amount AS win_qty,
       extract(epoch from g.claimed_at) * 1000 AS win_ms
  FROM yuplink.auction a
  JOIN yuplink.raid_custom_item c ON c.id = a.prize_ref
  LEFT JOIN yuplink.player_gift g
    ON g.created_by = 'auction' AND g.status = 'claimed' AND g.claimed_at IS NOT NULL
   AND split_part(g.source_ref, ':', 1) = 'gaucwin' AND split_part(g.source_ref, ':', 2) = a.id
 WHERE a.source = 'player' AND a.prize_kind = 'custom' AND a.created_at < ${ts(till)}
   AND EXISTS (SELECT 1 FROM yuplink.raid_backpack_op o WHERE o.op = 'pay:gauclot:' || a.id)`;
}

type LotRow = {
  id: string;
  seller: string;
  qty: number | string;
  item_id: string;
  name: string | null;
  put_ms: number | string;
  back_ms: number | string | null;
  winner: string | null;
  win_qty: number | string | null;
  win_ms: number | string | null;
};

/** Строки лотов → строки истории товаров items (ключи журнала) до till. */
export function auctionRows(
  lots: readonly LotRow[],
  keyOf: ReadonlyMap<string, string>,
  items: ReadonlySet<string>,
  till: number,
): Hist[] {
  const out: Hist[] = [];
  const seen = new Set<string>();
  const before = (ms: number | string | null): ms is number | string =>
    ms !== null && Number(ms) < till;
  for (const r of lots) {
    const key = keyOf.get(r.item_id);
    if (!key || !items.has(key)) continue;
    const base = { item_key: key, source: "loot_bag", total: 0, price_cur: null, ref: null };
    const place = `auc:${r.id}`;
    if (!seen.has(r.id)) {
      seen.add(r.id);
      const lot = { ...base, account_id: r.seller, qty: r.qty, place, counterparty: null };
      out.push({ ...lot, id: `${r.id}:put`, at_ms: r.put_ms, side: "put" });
      if (before(r.back_ms))
        out.push({ ...lot, id: `${r.id}:back`, at_ms: r.back_ms, side: "take" });
    }
    if (r.winner && before(r.win_ms)) {
      out.push({
        ...base,
        id: `${r.id}:win:${r.winner}`,
        account_id: r.winner,
        at_ms: r.win_ms,
        side: "take",
        qty: r.win_qty ?? r.qty,
        place,
        counterparty: r.seller,
      });
    }
  }
  return out;
}

/**
 * Строки аукциона для товаров items (ключи журнала, что уже в истории). Сбой
 * чтения не роняет подтяжку: очки пойдут без аукциона, как до 14.10.
 */
export async function auctionHist(till: number, items: ReadonlySet<string>): Promise<Hist[]> {
  if (items.size === 0) return [];
  let lots: LotRow[] = [];
  try {
    lots = ((await mcpExec(auctionSql(till), { wrapJson: true })) ?? []) as LotRow[];
  } catch (e) {
    console.warn("[tour-own] аукцион не прочитан:", e instanceof Error ? e.message : e);
    return [];
  }
  if (lots.length === 0) return [];
  const goods = [...new Map(lots.map((r) => [r.item_id, r.name ?? ""])).entries()];
  const keys = await marketKeysCanon(
    goods.map(([id, name]) => ({ id, kind: "custom", refId: id, name, giveToken: null })),
  );
  const keyOf = new Map<string, string>();
  goods.forEach(([id], i) => {
    const k = keys[i];
    if (k) keyOf.set(id, k);
  });
  return auctionRows(lots, keyOf, items, till);
}
