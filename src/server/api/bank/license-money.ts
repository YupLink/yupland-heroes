// Куда идут деньги лицензии банка (владелец, 15.10.2026):
//  · половина — на откуп золота из пула банка: DARAI — в очередь откупа сразу,
//    USDT — в корзину «$ → откуп золота» (bank_usd), меняется на Ref сразу, как
//    «$ → карта», и полученные DARAI тоже идут в откуп (energy-sub/batch.ts);
//  · половина — как подписка: те же доли и корзины (moneyCtes / splitPayment).
// Разложение — одним запросом с отметкой booked: повтор ничего не удваивает,
// недоразложенное (сбой между оплатой и разложением) подбирает обход.
// Только DARAI и USDT: лицензия за алмазы пишется сразу разложенной (алмазы
// сгорают), и обход её не трогает — иначе она ушла бы в долларовую ветку.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { moneyCtes } from "../energy-sub/money-sql";

export type LicenseToken = "Darai" | "USDT";

/** Половины оплаты: на откуп и как подписка; сумма — ровно цена. */
export function splitLicense(token: LicenseToken, price: number): { buyback: number; sub: number } {
  const dp = token === "USDT" ? 1e6 : 1e8;
  const buyback = Math.floor((price / 2) * dp) / dp;
  return { buyback, sub: Math.round((price - buyback) * dp) / dp };
}

type Buy = { id: string; token: LicenseToken; price: number };

/** Запрос разложения одной покупки (пусто, если уже разложена). */
export function bookSql(b: Buy): string {
  const { buyback, sub } = splitLicense(b.token, b.price);
  const bank =
    b.token === "Darai"
      ? `INSERT INTO yuplink.bank_buyback (id, token, amount, source, ref)
  SELECT 'bb_' || lic.id, 'Darai', ${buyback.toFixed(8)}, 'license', 'banklic:' || lic.id || ':bank' FROM lic
  ON CONFLICT (ref) DO NOTHING`
      : `INSERT INTO yuplink.money_bucket_move (id, bucket, token, amount, kind, ref, note)
  SELECT 'mbm_' || lic.id || '_bank_usd', 'bank_usd', 'USDT', ${buyback.toFixed(6)}, 'income',
         'banklic:' || lic.id || ':bank_usd', 'лицензия банка: откуп золота'
    FROM lic
  ON CONFLICT (ref) DO NOTHING`;
  const money = moneyCtes({
    after: "lic",
    id: b.id,
    prefix: "banklic",
    note: "лицензия банка: половина как подписка",
    token: b.token,
    amount: sub,
  });
  return `
WITH lic AS (
  UPDATE yuplink.bank_license_buy SET booked = true
   WHERE id = ${sqlStr(b.id)} AND NOT booked
  RETURNING id
), bank AS (
  ${bank}
  RETURNING 1
)${money}
SELECT row_to_json(_t.*) AS _row FROM (SELECT (SELECT count(*) FROM lic)::int AS booked) _t;`;
}

/** Провести ждущий откуп (пул пуст — ничего не делает). */
export async function runBuyback(): Promise<void> {
  await mcpExec(`SELECT yuplink.bank_buyback_run() AS done;`, { wrapJson: true }).catch((e) =>
    console.warn("[bank] откуп:", e instanceof Error ? e.message : e),
  );
}

async function book(b: Buy): Promise<void> {
  if (b.token !== "Darai" && b.token !== "USDT") return;
  await mcpExec(bookSql(b));
  if (b.token === "Darai") await runBuyback();
  else {
    // Доллары откупа — на Ref сразу, как «$ → карта».
    const { runDueBatches } = await import("../energy-sub/batch");
    void runDueBatches({ force: "bank_usd" }).catch(() => {});
  }
}

type Row = { id: string; token: LicenseToken; price: number | string };

/** Разложить покупку по ключу оплаты (зовётся сразу после покупки). */
export async function bookLicenseMoney(opRef: string): Promise<void> {
  const rows = (await mcpExec(
    `SELECT id, token, price FROM yuplink.bank_license_buy WHERE op_ref = ${sqlStr(opRef)} AND NOT booked AND token IN ('Darai', 'USDT') LIMIT 1;`,
    { wrapJson: true },
  )) as Row[];
  const r = rows?.[0];
  if (r) await book({ id: r.id, token: r.token, price: Number(r.price) });
}

/** Обход: покупки, которые не успели разложиться (старше минуты). */
export async function bookPendingLicenseMoney(): Promise<void> {
  const rows = (await mcpExec(
    `SELECT id, token, price FROM yuplink.bank_license_buy
      WHERE NOT booked AND token IN ('Darai', 'USDT')
        AND created_at < now() - interval '1 minute' ORDER BY created_at LIMIT 20;`,
    { wrapJson: true },
  )) as Row[];
  for (const r of rows ?? []) await book({ id: r.id, token: r.token, price: Number(r.price) });
}
