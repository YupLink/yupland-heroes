// Запросы покупки подписки — только сервер (node:crypto). Серверная функция
// buy.ts берёт их динамическим импортом: иначе node:crypto уехал бы в
// клиентскую сборку вместе с файлом серверной функции.
import { createHash } from "node:crypto";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import type { SubToken } from "@/lib/energySub";
import type { SubTier } from "./tiers";
import { moneyCtes } from "./money-sql";

/** id подписки — от ключа оплаты: повтор нажатия попадает в ту же строку. */
export const subIdOf = (payRef: string) =>
  `es_${createHash("sha1").update(payRef).digest("hex").slice(0, 16)}`;

export type Buy = {
  subId: string;
  account: string;
  wallet: string;
  tier: SubTier;
  token: SubToken;
  amount: number;
  rate: number | null;
  payRef: string;
};

/** Подписка + корзины + пул карты — одним запросом, повтор ничего не удваивает. */
export function createSubSql(b: Buy): string {
  const money = moneyCtes({
    after: "sub",
    id: b.subId,
    prefix: "esub",
    note: "подписка на энергию",
    token: b.token,
    amount: b.amount,
  });
  const t = b.tier;
  return `
WITH sub AS (
  INSERT INTO yuplink.energy_sub
    (id, account_id, wallet, tier_id, tier_name, token, amount, price_usd, darai_per_usd,
     energy_per_day, box_pack_id, boxes_per_day, days, starts_at, ends_at, pay_ref, no_decay, license_tier)
  SELECT ${sqlStr(b.subId)}, ${sqlStr(b.account)}, ${sqlStr(b.wallet)}, ${sqlStr(t.id)},
         ${sqlStr(t.name)}, ${sqlStr(b.token)}, ${b.amount.toFixed(8)}, ${t.priceUsd.toFixed(2)},
         ${b.rate ? b.rate.toFixed(8) : "NULL"}, ${t.energyPerDay}, ${t.boxPackId ? sqlStr(t.boxPackId) : "NULL"},
         ${t.boxesPerDay}, ${t.days}, now(), now() + ${t.days} * interval '1 day', ${sqlStr(b.payRef)},
         ${t.noDecay === true}, ${t.licenseTier ? sqlStr(t.licenseTier) : "NULL"}
   -- оплату уже вернули — подписки по ней не будет
   WHERE NOT EXISTS (SELECT 1 FROM yuplink.acc_ledger
                      WHERE kind = 'acc_refund' AND ref = ${sqlStr(`${b.payRef}-undo`)})
  ON CONFLICT (pay_ref) DO NOTHING
  RETURNING id
)${money}
SELECT row_to_json(_t.*) AS _row FROM (
  SELECT (SELECT id FROM sub) AS created,
         (SELECT id FROM yuplink.energy_sub WHERE pay_ref = ${sqlStr(b.payRef)}) AS existing
) _t;`;
}

/** Прежнее списание по ключу: сколько сняли и не вернули ли уже. */
export async function prevPayment(payRef: string, token: string): Promise<{ paid: number; undone: boolean }> {
  const rows = (await mcpExec(
    `SELECT (SELECT -delta FROM yuplink.acc_ledger
              WHERE kind = 'acc_spend' AND ref = ${sqlStr(payRef)} AND token = ${sqlStr(token)} LIMIT 1)::text AS paid,
            EXISTS (SELECT 1 FROM yuplink.acc_ledger
                     WHERE kind = 'acc_refund' AND ref = ${sqlStr(`${payRef}-undo`)}) AS undone;`,
    { wrapJson: true },
  )) as Array<{ paid: string | null; undone: boolean }> | null;
  return { paid: Number(rows?.[0]?.paid) || 0, undone: !!rows?.[0]?.undone };
}

export async function subExists(payRef: string): Promise<boolean> {
  const rows = (await mcpExec(
    `SELECT 1 AS ok FROM yuplink.energy_sub WHERE pay_ref = ${sqlStr(payRef)} LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ ok: number }>;
  return !!rows?.length;
}

/**
 * Досчитать энергию перед подпиской «без таяния»: всё, что должно было
 * растаять ДО неё, тает сейчас, а не прощается подпиской (esub-05).
 * Сбой не мешает покупке — в худшем случае игрок не дотает пару единиц.
 */
export async function settleEnergyBeforeShield(account: string): Promise<void> {
  await mcpExec(`SELECT 1 AS ok FROM yuplink.energy_touch_acc(${sqlStr(account)}, 0);`).catch((e) =>
    console.warn("[esub] энергия перед подпиской не досчиталась:", e instanceof Error ? e.message : e),
  );
}
