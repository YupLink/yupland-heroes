// Пак-сироты крона lost-payments: оплата DARAI прошла, пак не выдан.
// Вынесено из routes/api.cron.lost-payments.ts без изменения логики (§13.1).
import { mcpExec } from "@/server/db/mcpClient";
import { fetchAdminFtTransferHistory } from "@/server/sendler";
import { nanoid } from "nanoid";

// Константы DARAI-паков (совпадают с chips.ts).
const DARAI_FT = "darai.tkn.near";
const PACK_DARAI_DECIMALS = 18;
const PACK_RECEIVER = "darai_gdrop.near";

/**
 * АВТО-выдача пак-сирот: юзер оплатил DARAI за пак on-chain, но фронт не дошёл до
 * purchaseChipPackViaDarai → пак не выдан. Сверяем входящие DARAI (Sendler) с
 * darai_deposits; для незачтённых берём memo `buy chip pack {packId}` ИЗ ЗАПИСИ
 * Sendler и ВЫДАЁМ пак: INSERT darai_deposits (идемпотентно
 * по tx_hash) + buy_chip_pack_atomic × count. Билетные платежи и депозиты
 * пропускаем. В отличие от прежнего — не алертим, а сразу выдаём (+ уведомление).
 */
export async function runPackOrphanReconcile(): Promise<{
  delivered: number;
  packs: number;
}> {
  const q = (s: string) => mcpExec(s, { wrapJson: true }) as Promise<Record<string, unknown>[]>;
  const packRows = (await q(
    `SELECT id, price_darai FROM yuplink.chip_packs WHERE price_darai IS NOT NULL AND active=true AND COALESCE(market_hidden,false)=false;`,
  )) as Array<{ id: string; price_darai: number }>;
  const priceById = new Map(packRows.map((p) => [p.id, Number(p.price_darai)]));
  if (priceById.size === 0) return { delivered: 0, packs: 0 };

  const deposited = new Set(
    (
      (await q(
        `SELECT lower(tx_hash) tx FROM yuplink.darai_deposits WHERE tx_hash IS NOT NULL;`,
      )) as Array<{ tx: string }>
    ).map((r) => r.tx),
  );
  const ticketTx = new Set(
    (
      (await q(
        `SELECT lower(near_tx_hash) tx FROM yuplink.ticket_purchases WHERE near_tx_hash IS NOT NULL;`,
      )) as Array<{ tx: string }>
    ).map((r) => r.tx),
  );

  const inc = await fetchAdminFtTransferHistory({
    walletId: PACK_RECEIVER,
    direction: "in",
    symbol: "Darai",
    limit: 200,
  });
  // ⚠️ Никакого NEAR RPC здесь больше нет.
  //
  // Прежде на КАЖДЫЙ из двухсот переводов уходил запрос `tx` в цепь — это и
  // забивало пул узлов, которым отправляются выплаты, и растягивало разбор.
  // А memo для «архивных» транзакций дочитывалось голым fetch в nearblocks.io
  // БЕЗ таймаута: одна зависшая сессия вешала весь разбор навсегда (видели
  // прогон, молчавший больше получаса). Плюс сторонний источник транзакций
  // прямо запрещён правилом — транзакции только через Sendler.
  //
  // Всё нужное Sendler отдаёт в самой записи перевода: memo, подписанта и
  // сумму. Направление и получателя гарантирует сам запрос истории выше.
  const { readTopUpMemo } = await import("./lost-payments-account-memo");

  let count = 0;
  let packCount = 0;
  for (const t of inc) {
    if ((t.symbol ?? "") !== "Darai") continue;
    const tx = t.txHash ?? "";
    const txl = tx.toLowerCase();
    if (!tx || deposited.has(txl) || ticketTx.has(txl)) continue;
    const mm = readTopUpMemo(t);
    if (!mm) continue; // без подписанта выдавать некому
    const memo = mm.memo;
    const rawAmount = BigInt(t.amount ?? "0");
    const human = Number(rawAmount / 10n ** BigInt(PACK_DARAI_DECIMALS - 4)) / 1e4;
    // ТОЛЬКО по memo `buy chip pack {packId}` — без матча по сумме, иначе любой
    // 50k-кратный DARAI-перевод (не пак) выдался бы как пак.
    const m = memo.match(/buy chip pack (\S+)/);
    const packId = m?.[1] ?? null;
    if (!packId || !priceById.has(packId)) continue; // не пак-платёж
    const price = priceById.get(packId)!;
    const cnt = Math.floor(human / price);
    if (cnt < 1) continue;
    const signer = mm.signer;
    const s = signer.replace(/'/g, "''");
    const paid = cnt * price;
    // ГАРД: реально ли записали депозит (RETURNING). Если tx уже был — 0 строк,
    // пропускаем (иначе buy падал на нехватке баланса, а «выдал» слал ложно).
    const insRows = (await mcpExec(
      `INSERT INTO yuplink.darai_deposits(id,wallet,amount,tx_hash,ft_contract,receiver_id,created_at)
       VALUES('${nanoid()}','${s}',${paid},'${tx.replace(/'/g, "''")}','${DARAI_FT}','${PACK_RECEIVER}',now())
       ON CONFLICT (tx_hash) DO NOTHING RETURNING id;`,
      { wrapJsonCte: true },
    )) as Array<{ id: string }>;
    if (insRows.length === 0) {
      deposited.add(txl);
      continue; // депозит уже был — ничего не выдаём и НЕ уведомляем
    }
    for (let i = 0; i < cnt; i++) {
      await mcpExec(
        `SELECT grant_id FROM yuplink.buy_chip_pack_atomic('${s}','${packId.replace(/'/g, "''")}','darai');`,
      ).catch(() => {});
    }
    deposited.add(txl);
    count++;
    packCount += cnt;
    console.log(
      `[lost-payments] авто-выдал пак-сироту: ${signer} ${cnt}×${packId} (${human} DARAI, tx ${tx.slice(0, 12)})`,
    );
  }
  // Оповещение владельцу УБРАНО — рутинная авто-выдача не должна спамить. Итог
  // возвращается в JSON крона (delivered/packs) + console.log выше.
  return { delivered: count, packs: packCount };
}

/**
 * Метки пак-платежей одной картой: tx → memo.
 *
 * Раньше здесь был точечный `fetch` в nearblocks.io на КАЖДУЮ квитанцию, без
 * таймаута — и одна зависшая сессия вешала весь разбор навсегда. Плюс сторонний
 * источник транзакций запрещён правилом: транзакции только через Sendler.
 *
 * Оговорка честная: Sendler отдаёт последние 200 входящих переводов, и метку
 * депозита старше этого окна карта не знает. Досчёт по нему просто не сработает
 * — но это ровно то же окно, в котором уже работает разбор пак-сирот выше.
 */
export async function packMemoByTx(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const inc = await fetchAdminFtTransferHistory({
    walletId: PACK_RECEIVER,
    direction: "in",
    symbol: "Darai",
    limit: 200,
  }).catch(() => [] as Awaited<ReturnType<typeof fetchAdminFtTransferHistory>>);
  for (const t of inc) {
    const tx = (t.txHash ?? "").toLowerCase();
    if (!tx) continue;
    const memo = String((t.raw as Record<string, unknown>)?.memo ?? "");
    if (memo) out.set(tx, memo);
  }
  return out;
}
