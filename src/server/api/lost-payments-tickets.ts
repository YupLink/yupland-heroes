// Тикет-сироты крона lost-payments: входящие FT vs ticket_purchases.
// Вынесено из routes/api.cron.lost-payments.ts без изменения логики (§13.1).
import { mcpExec } from "@/server/db/mcpClient";
import { fetchAdminFtTransferHistory } from "@/server/sendler";
import {
  TICKET_TOKEN_DECIMALS,
  TICKET_RECEIVER,
  applyDiscountCeil,
  senderTicketDiscountPct,
} from "./lost-payments-ticket-price";

/**
 * С 20.10.2026 (§8.61) билетов нет: найденную оплату билетов крон НЕ зачисляет,
 * а пишет в лог — сопоставление ниже оставлено ради точной строки лога.
 *
 * АВТО-реконсиляция тикет-сирот: юзер оплатил DARAI/GDarai/GP на приёмник, но
 * фронт не дошёл до purchaseTicketsViaToken (закрыл вкладку/потерял сессию) →
 * билеты не начислены. Сверяем входящие FT (Sendler) с ticket_purchases и
 * добиваем недостающие идемпотентно (тот же ключ ft:{txHash}, что у обычного
 * флоу, — повторный submit с фронта не задвоит). Только чистый матч на оффер
 * (ratio 0.80–1.06, лучший фит), не pack-платёж, отправитель — реальный юзер.
 */
/** Квитанции, о которых уже сказали в лог (оплата билетов после их отмены). */
const warned = new Set<string>();

export async function runTicketOrphanReconcile(): Promise<{
  credited: number;
  tickets: number;
}> {
  const q = (s: string) => mcpExec(s, { wrapJson: true }) as Promise<Record<string, unknown>[]>;

  const offers = (await q(
    `SELECT id, payment_token pt, price_token, tickets FROM yuplink.ticket_shop_offers WHERE payment_token IS NOT NULL AND active=true;`,
  )) as Array<{ id: string; pt: string; price_token: number; tickets: number }>;
  const bySym = new Map<string, typeof offers>();
  const offById = new Map<string, (typeof offers)[number]>();
  for (const o of offers) {
    const arr = bySym.get(o.pt) ?? [];
    arr.push(o);
    bySym.set(o.pt, arr);
    offById.set(o.id, o);
  }

  const credited = new Set(
    (
      (await q(
        `SELECT lower(near_tx_hash) tx FROM yuplink.ticket_purchases WHERE near_tx_hash IS NOT NULL;`,
      )) as Array<{ tx: string }>
    ).map((r) => r.tx),
  );
  // Пак/депозит-платежи (тот же приёмник darai_gdrop.near!) — исключаем, иначе
  // пак-платёж кредитуется КАК билеты поверх выданного пака. ВНИМАНИЕ: колонка
  // называется tx_hash (НЕ near_tx_hash) — раньше был баг (пустой set → 235
  // фантомных билетов). Без .catch — плохая колонка должна падать громко.
  const packTx = new Set<string>();
  // Пополнение ресурсного счёта идёт на ТОТ ЖЕ приёмник. Без этой строки крон
  // засчитывал бы его вторым разом как покупку билетов — и делал бы это каждые
  // полчаса, пока квитанция в окне истории.
  for (const t of ["darai_deposits", "redemptions", "acc_deposit_tx"]) {
    const rows = (await q(
      `SELECT lower(tx_hash) tx FROM yuplink.${t} WHERE tx_hash IS NOT NULL;`,
    )) as Array<{ tx: string }>;
    for (const r of rows) if (r.tx) packTx.add(r.tx);
  }
  // Энергопаки платятся на ТОТ ЖЕ приёмник, а ключ у них бывает вида
  // `ft:<tx>:<packId>` — колонка tx_hash при этом пустая, поэтому свой SELECT
  // их не находит. Без этого крон доплачивал билетами за оплату энергии: 209
  // записей и 1624 билета за десять дней.
  {
    const { knownEnergyTx } = await import("./lost-payments-energy-settle");
    for (const tx of await knownEnergyTx()) if (tx) packTx.add(tx.toLowerCase());
  }
  // Цены паков за DARAI — чтобы НЕ спутать пак-платёж с билетным оффером даже до
  // записи депозита (пак-реконсилер может ещё не отработать в этом же прогоне).
  const packPrices = (
    (await q(
      `SELECT DISTINCT price_darai FROM yuplink.chip_packs WHERE price_darai IS NOT NULL AND price_darai>0;`,
    )) as Array<{ price_darai: number }>
  ).map((r) => Number(r.price_darai));
  const matchesPackPrice = (human: number) =>
    packPrices.some((p) => {
      const n = Math.round(human / p);
      return n >= 1 && n <= 50 && Math.abs(human - p * n) < 1;
    });
  const knownUsers = new Set(
    ((await q(`SELECT wallet FROM yuplink.users;`)) as Array<{ wallet: string }>).map(
      (r) => r.wallet,
    ),
  );

  const inc = await fetchAdminFtTransferHistory({
    walletId: TICKET_RECEIVER,
    direction: "in",
    limit: 200,
  });

  for (const t of inc) {
    const sym = t.symbol ?? "";
    const dec = TICKET_TOKEN_DECIMALS[sym];
    if (dec === undefined) continue;
    const tx = t.txHash ?? "";
    const txl = tx.toLowerCase();
    if (!tx || credited.has(txl) || packTx.has(txl)) continue;
    const sender = t.sender ?? "";
    if (!sender || !knownUsers.has(sender)) continue; // только реальные юзеры
    // РАЗЛИЧЕНИЕ ПО MEMO (клиент кладёт его в ft_transfer): пак = `buy chip pack
    // {id}`, билет = `buy tickets x{qty}`. Memo надёжнее суммы (тот же приёмник!).
    const raw = (t.raw ?? {}) as Record<string, unknown>;
    const memo = String((raw.memo ?? raw.msg ?? "") || "");
    if (/buy chip pack/i.test(memo)) continue; // это ПАК — не наш флоу
    // Пополнение счёта: memo ставит клиент (src/lib/ftTransfer.ts). Второй
    // рубеж на случай, если квитанция ещё не записана в acc_deposit_tx.
    if (/account top-up/i.test(memo)) continue;
    if (/buy energy pack/i.test(memo)) continue; // это ЭНЕРГИЯ — не наш флоу
    const isTicketMemo = /buy tickets/i.test(memo);
    let human = 0;
    try {
      human = Number(BigInt(t.amount ?? "0")) / 10 ** dec;
    } catch {
      continue;
    }
    // Если memo НЕ подтверждает билет (пустой/старый) — фоллбэк-гард по цене пака
    // (premium-пак 5M DARAI иначе матчился на билет-оффер 6M/5тк при ratio 0.83).
    if (!isTicketMemo && matchesPackPrice(human)) continue;
    // КОЛ-ВО ПАКОВ берём ИЗ MEMO (`buy tickets [offerId] x{qty}`) — это то, что
    // реально нажал юзер, а не догадка по сумме. Опц. offerId в memo (новый клиент)
    // → точный оффер. БАГ, который это чинит: скидочный платёж (напр. 43 = −15% от
    // оффера 50 GDarai/110тк) жадно матчился на дешёвый оффер ×N (ts_av1kbeA4 1×43 =
    // 86тк, ratio 1.0), т.к. старый матчер искал ratio≈1 и игнорировал и memo-qty,
    // и подписочную скидку. Теперь qty фиксируется из memo, а оффер выбирается по
    // ТОЧНОЙ скидке отправителя (из общей БД портала) — см. ниже.
    const mm = memo.match(/buy tickets\s+(?:(\S+)\s+)?x(\d+)/i);
    const rawOfferId = mm?.[1];
    const memoOfferId = rawOfferId && offById.has(rawOfferId) ? rawOfferId : null;
    const memoQty = mm ? Math.min(50, Math.max(1, Number(mm[2]))) : null;
    let best: { offer: string; qty: number; tickets: number } | null = null;
    if (memoQty) {
      // ТОЧНАЯ скидка отправителя из общей БД портала (как в живом флоу). Оффер,
      // чья ОЖИДАЕМАЯ уплата applyDiscountCeil(base,disc)×qty == уплаченному, —
      // верный, даже если paid < base из-за скидки. Диапазон [base×qty×0.85 ..
      // base×qty] — фоллбэк-гард, если тир сменился между оплатой и прогоном крона.
      const disc = await senderTicketDiscountPct(sender);
      const cands: Array<{
        offer: string;
        qty: number;
        tickets: number;
        base: number;
        exact: boolean;
      }> = [];
      for (const o of bySym.get(sym) ?? []) {
        if (memoOfferId && o.id !== memoOfferId) continue;
        const full = o.price_token * memoQty;
        // клиент платит effPrice-per-unit × qty (см. my-nfts.tsx purchaseToken)
        const expected = applyDiscountCeil(o.price_token, disc) * memoQty;
        // Пол — РЕАЛЬНАЯ скидка отправителя, а не 15% каждому. Прежний гард
        // засчитывал недоплату 15-20% как полную покупку: билеты со скидкой
        // без подписки, повторяемо.
        const lo = Math.max(1, expected);
        const exact = Math.abs(human - expected) < 0.51;
        const inRange = human >= lo - 0.51 && human <= full + 0.51;
        if (exact || inRange) {
          cands.push({
            offer: o.id,
            qty: memoQty,
            tickets: o.tickets * memoQty,
            base: o.price_token,
            exact,
          });
        }
      }
      // приоритет: точное совпадение по РЕАЛЬНОЙ скидке отправителя; при равенстве
      // — оффер с большей базой (его видел юзер, низкий paid = скидка, не дешёвый ×N).
      cands.sort((a, b) => Number(b.exact) - Number(a.exact) || b.base - a.base);
      if (cands[0])
        best = {
          offer: cands[0].offer,
          qty: cands[0].qty,
          tickets: cands[0].tickets,
        };
    } else {
      // LEGACY: memo без qty (старые/пустые платежи) — прежний ratio-матчер.
      const discLegacy = await senderTicketDiscountPct(sender);
      let bestR: { offer: string; qty: number; tickets: number; r: number } | null = null;
      for (const o of bySym.get(sym) ?? []) {
        const qk = Math.max(1, Math.round(human / o.price_token));
        if (qk > 50) continue;
        const ratio = human / (o.price_token * qk);
        // Тот же пол: 0.85 при подписке 15%, ровно 1.0 без подписки.
        const floor = 1 - discLegacy / 100;
        if (ratio >= floor - 0.005 && ratio <= 1.06) {
          if (!bestR || Math.abs(ratio - 1) < Math.abs(bestR.r - 1))
            bestR = { offer: o.id, qty: qk, tickets: o.tickets * qk, r: ratio };
        }
      }
      if (bestR) best = { offer: bestR.offer, qty: bestR.qty, tickets: bestR.tickets };
    }
    if (!best) continue;
    // Билетов больше нет (§8.61): оплату билетов НЕ зачисляем — ни записи
    // покупки, ни начисления, только строка в лог (разбор вручную). Квитанция
    // остаётся несопоставленной, поэтому лог — раз на процесс, а не каждый прогон.
    if (warned.has(txl)) continue;
    warned.add(txl);
    console.warn(
      `[lost-payments] оплата билетов после их отмены — НЕ зачислено: ${sender} ${sym} ${human} ` +
        `→ ${best.offer} ×${best.qty} (${best.tickets}тк), tx ${tx}`,
    );
  }
  return { credited: 0, tickets: 0 };
}
