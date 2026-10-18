// Выдача набора ОДНИМ запросом: бронь «reserved → granted» — только если деньги
// по ключу брони списаны и не возвращены, — и в том же запросе подарок «бокс ×N»
// и деньги по корзинам. Разнести нельзя: обрыв между отметкой и подарком оставил
// бы оплаченный набор без товара, а подарок без отметки — товар, который потом
// вернули бы деньгами.
//
// Подарок — тот же, каким бокс выдаёт админ и подписка (gifts-deliver.ts, вид
// pack): бокс и количество — из снимка брони, имя и обложка — у бокса. Купленный
// подарок не сгорает (expires_at NULL): за него заплачено.
//
// Деньги — как у подписки (energy-sub/money-sql.ts): splitPayment раскладывает
// оплату по корзинам, доля DARAI идёт в пул карты. Пишутся только вслед за
// отметкой «выдано»: снятая бронь (деньги вернулись) в корзины не попадает.
import { sqlStr } from "../raid-shared";
import type { KitToken } from "@/lib/kits";
import { moneyCtes } from "../energy-sub/money-sql";

export type GrantInput = {
  id: string;
  payRef: string;
  token: KitToken;
  amount: number;
};

/** Ключ повтора подарка набора (player_gift.source_ref). */
export const kitGiftRef = (orderId: string): string => `kit:${orderId}:box`;

/** Запрос выдачи. Ответ — `{_row: {granted, gifts}}` (granted 0 — отметка не встала). */
export function grantSql(o: GrantInput): string {
  if (!(o.amount > 0)) throw new Error("У брони набора нет суммы оплаты");
  const giftRef = sqlStr(kitGiftRef(o.id));
  const money = moneyCtes({
    after: "o",
    id: o.id,
    prefix: "kit",
    note: "набор",
    token: o.token,
    amount: o.amount,
  });
  return `
WITH o AS (
  UPDATE yuplink.kit_order SET status = 'granted', updated_at = now()
   WHERE id = ${sqlStr(o.id)} AND status = 'reserved'
     AND EXISTS (SELECT 1 FROM yuplink.acc_ledger
                  WHERE kind = 'acc_spend' AND ref = ${sqlStr(o.payRef)})
     AND NOT EXISTS (SELECT 1 FROM yuplink.acc_ledger
                      WHERE kind = 'acc_refund' AND ref = ${sqlStr(`${o.payRef}-undo`)})
  RETURNING id, account_id, box_id, box_count
), gifts AS (
  INSERT INTO yuplink.player_gift
    (id, account_id, kind, amount, ref_id, title, image, note, status, source_ref, created_by,
     expires_at)
  SELECT 'gft_' || substr(md5(${giftRef}), 1, 12), o.account_id, 'pack', o.box_count, o.box_id,
         p.name, p.cover_image_url, 'kit:' || replace(coalesce(p.name, ''), '|', '/') || '|',
         'pending', ${giftRef}, 'kit', NULL
    FROM o LEFT JOIN yuplink.chip_packs p ON p.id = o.box_id
  ON CONFLICT (source_ref) WHERE source_ref IS NOT NULL DO NOTHING
  RETURNING 1
)${money}
SELECT row_to_json(_t.*) AS _row FROM (
  SELECT (SELECT count(*) FROM o)::int AS granted, (SELECT count(*) FROM gifts)::int AS gifts
) _t;`;
}
