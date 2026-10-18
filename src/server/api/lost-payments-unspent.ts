// Досчёт «депозит записан, пак НЕ выдан» — по непотраченному DARAI-балансу.
// Вынесено из lost-payments-packs.ts без изменения логики (§13.1).
import { mcpExec } from "@/server/db/mcpClient";
import { packMemoByTx } from "./lost-payments-packs";

/**
 * ДОСЧЁТ «депозит записан, пак НЕ выдан». runPackOrphanReconcile ловит только
 * НЕзаписанные депозиты; если buy_chip_pack_atomic упал ПОСЛЕ INSERT депозита,
 * пак не выдан, а депозит скрывает платёж от реконсилера навсегда. Тут находим
 * коши с непотраченным DARAI-балансом (deposits+redemptions−spend ≥ мин.цены) и
 * по их депозитам (СВЕЖИЕ первыми — обычно крашится последняя покупка) добиваем
 * паки. buy_chip_pack_atomic гардит not_enough_darai → суммарно доставим НЕ
 * больше оплаченного (двойной выдачи нет), даже если угадали не тот депозит.
 */
export async function runUnspentPackSettle(): Promise<{
  delivered: number;
  wallets: number;
}> {
  const q = (s: string) => mcpExec(s, { wrapJson: true }) as Promise<Record<string, unknown>[]>;
  const packRows = (await q(
    `SELECT id, price_darai FROM yuplink.chip_packs WHERE price_darai IS NOT NULL AND active=true;`,
  )) as Array<{ id: string; price_darai: number }>;
  const priceById = new Map(packRows.map((p) => [p.id, Number(p.price_darai)]));
  if (priceById.size === 0) return { delivered: 0, wallets: 0 };
  const minPrice = Math.min(...priceById.values());

  // ВАЖНО: берём ТОЛЬКО deposits − spend (БЕЗ redemptions). redemptions(DARAI) —
  // это НАГРАДА, а не оплата пака: её юзер вправе потратить сам (владелец 25.07:
  // «непотраченный баланс ≠ потерянный платёж»). Досчитываем лишь оплаченные, но
  // НЕ выданные паки (deposit с memo `buy chip pack`, spend его не покрыл).
  const bals = (await q(
    `WITH w AS (SELECT DISTINCT wallet FROM yuplink.darai_deposits)
     SELECT w.wallet,
       (coalesce((SELECT sum(amount) FROM yuplink.darai_deposits d WHERE d.wallet=w.wallet),0)
        - coalesce((SELECT sum(amount) FROM yuplink.chip_economy_spend s WHERE s.wallet=w.wallet),0))::float8 avail
     FROM w`,
  )) as Array<{ wallet: string; avail: number }>;
  const targets = bals.filter((b) => Number(b.avail) >= minPrice);
  if (targets.length === 0) return { delivered: 0, wallets: 0 };
  // Метки берём ОДНОЙ картой на весь прогон. Прежде на каждую квитанцию уходил
  // отдельный запрос в сторонний сервис без таймаута — сотни походов подряд, и
  // любой зависший вешал разбор целиком.
  const memoByTx = await packMemoByTx();

  let delivered = 0;
  let walletsTouched = 0;
  for (const t of targets) {
    const wallet = String(t.wallet);
    const wq = wallet.replace(/'/g, "''");
    let avail = Number(t.avail);
    const deps = (await q(
      `SELECT tx_hash, amount::text amount FROM yuplink.darai_deposits WHERE wallet='${wq}' ORDER BY created_at DESC;`,
    )) as Array<{ tx_hash: string; amount: string }>;
    let touched = false;
    for (const d of deps) {
      if (avail < minPrice) break;
      const memo = memoByTx.get(String(d.tx_hash).toLowerCase()) ?? "";
      const packId = memo.match(/buy chip pack (\S+)/)?.[1];
      if (!packId || !priceById.has(packId)) continue;
      const price = priceById.get(packId)!;
      const cnt = Math.floor(Number(d.amount) / price);
      for (let i = 0; i < cnt && avail >= price; i++) {
        try {
          const gr = (await q(
            `SELECT grant_id FROM yuplink.buy_chip_pack_atomic('${wq}','${packId.replace(/'/g, "''")}','darai');`,
          )) as Array<{ grant_id?: string }>;
          if (gr?.[0]?.grant_id) {
            delivered++;
            avail -= price;
            touched = true;
          } else break;
        } catch {
          break; // not_enough / daily_limit / sold_out — стоп по этому кошу
        }
      }
    }
    if (touched) {
      walletsTouched++;
      console.log(`[lost-payments] досчёт непотраченного: ${wallet} (остаток avail ${avail})`);
    }
  }
  return { delivered, wallets: walletsTouched };
}
