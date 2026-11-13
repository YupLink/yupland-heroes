// Выдача оплаченного картой (вебхук Xsolla order_paid, §8.127) и возврат при
// отмене (order_canceled). Каждое начисление — один раз: золото — res_move с ключом
// «xsolla:<заказ>:<sku>», подписка — energy_sub.pay_ref тем же ключом. Деньги
// пришли в Xsolla, не на счёт игры: корзины и пул карты не трогаются. Только сервер.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { cardKind } from "@/lib/xsollaCatalog";

export type PaidItem = { sku: string; quantity: number };
export type CardOrder = {
  orderId: number;
  account: string;
  items: PaidItem[];
  sandbox: boolean;
  amount: string | null;
  currency: string | null;
};

const keyOf = (orderId: number, sku: string) => `xsolla:${orderId}:${sku}`;

/** Заказ в журнал: создан при оплате или впервые увиден вебхуком. */
export function orderUpsertSql(
  o: CardOrder,
  status: "paid" | "ignored",
  note: string | null,
): string {
  const it = o.items[0];
  const kind = cardKind(it?.sku ?? "") ?? "gold";
  return `INSERT INTO yuplink.xsolla_order
     (order_id, account_id, sku, kind, usd, sandbox, status, paid_amount, paid_currency, note, paid_at)
   VALUES (${o.orderId}, ${sqlStr(o.account)}, ${sqlStr(it?.sku ?? "?")}, ${sqlStr(kind)},
           GREATEST(coalesce(nullif(${sqlStr(o.amount ?? "")}, '')::numeric, 0.01), 0.01), ${o.sandbox},
           ${sqlStr(status)}, ${o.amount ? sqlStr(o.amount) : "NULL"}, ${o.currency ? sqlStr(o.currency) : "NULL"},
           ${note ? sqlStr(note) : "NULL"}, now())
   ON CONFLICT (order_id) DO UPDATE
     SET status = CASE WHEN yuplink.xsolla_order.status = 'canceled' THEN 'canceled' ELSE EXCLUDED.status END,
         paid_amount = EXCLUDED.paid_amount, paid_currency = EXCLUDED.paid_currency,
         note = coalesce(EXCLUDED.note, yuplink.xsolla_order.note),
         paid_at = coalesce(yuplink.xsolla_order.paid_at, now());`;
}

export function goldGrantSql(account: string, orderId: number, it: PaidItem): string {
  return `SELECT g.amount::text AS gold, g.applied
     FROM yuplink.gold_shop_offer o,
          LATERAL yuplink.res_move(${sqlStr(account)}, 'gold', o.gold * ${Math.max(1, Math.trunc(it.quantity))},
                                   'gold_shop', ${sqlStr(keyOf(orderId, it.sku))}) g
    WHERE o.id = ${sqlStr(it.sku)}`;
}

/** Подписка за карту: снимок тарифа, валюта CARD, сумма — цена тарифа в $. */
export function subGrantSql(account: string, orderId: number, sku: string): string {
  const ref = keyOf(orderId, sku);
  return `INSERT INTO yuplink.energy_sub
     (id, account_id, wallet, tier_id, tier_name, token, amount, price_usd, darai_per_usd,
      energy_per_day, box_pack_id, boxes_per_day, days, starts_at, ends_at, pay_ref, no_decay, license_tier)
   SELECT 'es_' || substr(md5(${sqlStr(ref)}), 1, 16), a.id,
          coalesce(a.active_wallet, (SELECT u.wallet FROM yuplink.users u WHERE u.account_id = a.id
                                      ORDER BY u.created_at LIMIT 1), 'card'), t.id, t.name,
          'CARD', t.price_usd, t.price_usd, NULL, t.energy_per_day, t.box_pack_id, t.boxes_per_day, t.days,
          now(), now() + t.days * interval '1 day', ${sqlStr(ref)}, coalesce(t.no_decay, false), t.license_tier
     FROM yuplink.accounts a, yuplink.energy_sub_tier t
    WHERE a.id = ${sqlStr(account)} AND t.id = ${sqlStr(sku)}
   ON CONFLICT (pay_ref) DO NOTHING
   RETURNING id`;
}

/** Забрать выданное золото при отмене — сколько есть на счёте, не в минус. */
export function goldTakeBackSql(account: string, ref: string): string {
  return `WITH x AS (
     SELECT LEAST(l.delta, coalesce((SELECT ar.amount FROM yuplink.account_resources ar
                                      WHERE ar.account_id = ${sqlStr(account)} AND ar.resource = 'gold'), 0)) AS take
       FROM yuplink.res_ledger l
      WHERE l.kind = 'gold_shop' AND l.ref = ${sqlStr(ref)} AND l.delta > 0)
   SELECT g.applied FROM x, LATERAL yuplink.res_move(${sqlStr(account)}, 'gold', -x.take, 'gold_shop',
                                                     ${sqlStr(`${ref}:cancel`)}) g
    WHERE x.take > 0`;
}

/** Выдать всё из заказа. Бросает при сбое базы — вебхук ответит 500, Xsolla повторит. */
export async function grantCardOrder(
  o: CardOrder,
): Promise<{ gold: number; subs: string[]; unknown: string[] }> {
  let gold = 0;
  const subs: string[] = [];
  const unknown: string[] = [];
  for (const it of o.items) {
    const kind = cardKind(it.sku);
    if (kind === "gold") {
      const rows = (await mcpExec(goldGrantSql(o.account, o.orderId, it), {
        wrapJson: true,
      })) as Array<{
        gold: string;
        applied: boolean;
      }>;
      if (!rows?.[0]) unknown.push(it.sku);
      else gold += 1;
    } else if (kind === "sub") {
      try {
        await mcpExec(subGrantSql(o.account, o.orderId, it.sku), { wrapJsonCte: true });
        subs.push(it.sku);
      } catch (e) {
        // Такая подписка уже идёт (одна каждого вида, esub-10) — купили между окном и оплатой.
        if (!(e instanceof Error && e.message.includes("esub_one_active"))) throw e;
        unknown.push(`${it.sku}(уже идёт)`);
      }
    } else unknown.push(it.sku);
  }
  if (subs.length) {
    const { grantDueForAccount } = await import("../energy-sub/grant");
    await grantDueForAccount(o.account, { force: true }).catch((e) =>
      console.warn("[xsolla] день 1 подписки:", o.orderId, e),
    );
  }
  await mcpExec(
    orderUpsertSql(o, "paid", unknown.length ? `не выдано: ${unknown.join(",")}` : null),
  );
  return { gold, subs, unknown };
}

/** Отмена (возврат денег): золото — забрать, сколько есть; подписка — закончить сейчас. */
export async function cancelCardOrder(
  orderId: number,
  account: string,
  items: PaidItem[],
): Promise<void> {
  for (const it of items) {
    const kind = cardKind(it.sku);
    const ref = keyOf(orderId, it.sku);
    if (kind === "gold") {
      await mcpExec(goldTakeBackSql(account, ref), { wrapJson: true });
    } else if (kind === "sub") {
      await mcpExec(
        `UPDATE yuplink.energy_sub SET ends_at = now() WHERE pay_ref = ${sqlStr(ref)} AND ends_at > now() RETURNING id`,
        { wrapJsonCte: true },
      );
    }
  }
  await mcpExec(
    `UPDATE yuplink.xsolla_order SET status = 'canceled', canceled_at = now() WHERE order_id = ${orderId};`,
  );
}
