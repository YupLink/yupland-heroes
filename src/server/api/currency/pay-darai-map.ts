// DARAI на карте: списываем со счёта игрока и одновременно пополняем ПУЛ КАРТЫ.
//
// Правило (из обсуждения): пул карты — это счётчик. Формула снаружи —
//   payoutAvailable = walletBalance − mapReserved.
// Пока трата шла через голый payFromAccount, DARAI просто оставался на
// wallet_balance и «уходил в никуда» с точки зрения пулов: карта играла на
// одни и те же деньги, что раздача холдерам. Теперь каждая трата DARAI на
// клетке (маркет-постройка, портал, апгрейд) прибавляет столько же к пулу
// карты — тем самым уменьшая свободный «payoutAvailable».
//
// Что НЕ трогаем: внешние магазины (пак/энергия/билеты за DARAI). Их пул
// карты не увеличивают — они по-прежнему просто списываются в общий wallet,
// откуда идут на раздачи (правило пользователя: внешние — «ничего нового»).
//
// Списание в acc_ledger и запись в darai_pool_move — два отдельных
// оператора. Атомарности между ними нет, и это осознанное решение: сорвётся
// вторая — пул останется чуть недосчитанным, но деньги игрока не пострадают.
// Иначе пришлось бы тащить пулы в saved SQL-функцию, ломая её контракт.
import { payFromAccount } from "./spend";
import { insertPoolMove } from "../darai-pools-move";
import { mcpExec } from "../../db/mcpClient";
import type { AccMoveResult } from "./move";

/** Символ DARAI-токена ресурсного счёта (один на весь проект). */
export const DARAI_TOKEN = "Darai";

/**
 * Один раз за жизнь процесса обновляем CHECK-констрейнт darai_pool_move,
 * чтобы разрешить `player_spend`. Раньше он знал только четыре старых вида —
 * каждая запись новой ветки падала на «violates check constraint», её
 * глушил `.catch(console.warn)` в insertPoolMove, деньги списывались, а
 * счётчик пула не рос («тратил 2×1000 DARAI — пул не наполнился»).
 *
 * Миграция migrations/acc-40-pool-player-spend.sql делает то же самое; здесь
 * — страховка на случай, если её не накатили руками. Идемпотентно: DROP …
 * IF EXISTS + ADD с той же формой ограничения.
 */
let checkEnsured = false;
async function ensurePoolCheck(): Promise<void> {
  if (checkEnsured) return;
  try {
    await mcpExec(
      `ALTER TABLE yuplink.darai_pool_move DROP CONSTRAINT IF EXISTS darai_pool_move_check;`,
      { wrapJson: false },
    );
    await mcpExec(
      `ALTER TABLE yuplink.darai_pool_move ADD CONSTRAINT darai_pool_move_check CHECK (
         (kind = 'collection_deposit' AND amount > 0)
         OR (kind = 'map_reserve' AND amount < 0)
         OR (kind = 'map_release' AND amount > 0)
         OR (kind = 'player_spend')
         OR (kind = 'adjust')
       );`,
      { wrapJson: false },
    );
    checkEnsured = true;
  } catch (e) {
    // Не смогли применить — не блокируем сам платёж. При следующем вызове
    // попробуем снова; в логе будет видно причину.
    console.warn("[pool] ensurePoolCheck не отработал:", e);
  }
}

/**
 * Оплатить DARAI со счёта игрока и увеличить пул карты на ту
 * же сумму.
 *
 * `note` попадает в darai_pool_move.note (обрезается до 500 символов) — полезно
 * при разборе, за что ушли деньги: «маркет 12,-5», «портал на 8,3», «апгрейд
 * верфи 2т».
 */
export async function payDaraiToMapPool(opts: {
  wallet: string;
  amount: number;
  ref: string;
  note?: string;
  accountId?: string;
}): Promise<AccMoveResult & { stars?: number }> {
  // Звездочнику без DARAI на счёте — та же цена в звёздах (владелец, 07.10.2026).
  // Пул карты растёт только от DARAI: за звёзды строку пула не пишем.
  const { starsInsteadOfDarai } = await import("./darai-stars-pay");
  const stars = await starsInsteadOfDarai(opts.wallet, opts.amount);
  if (stars != null) {
    const paidStars = await payFromAccount({
      wallet: opts.wallet,
      token: "STARS",
      amount: stars,
      ref: opts.ref,
      accountId: opts.accountId,
    });
    return { ...paidStars, stars };
  }
  const paid = await payFromAccount({
    wallet: opts.wallet,
    token: DARAI_TOKEN,
    amount: opts.amount,
    ref: opts.ref,
    accountId: opts.accountId,
  });
  // Пул пишем и при applied=false. Это не «не списали», а «списано раньше»:
  // мост повторяет запрос вслепую, первая попытка легла, ответ потерялся, и
  // повтор вернул applied=false. Раньше пул в этом случае не рос, а возврат
  // (refundResources) всё равно вычитал сумму — счётчик уходил в минус.
  // Второй строки не будет: ключ пула — тот же ref, что у списания
  // (ON CONFLICT ref в insertPoolMove).
  // Гарантируем CHECK, разрешающий player_spend, до вставки.
  await ensurePoolCheck();
  await insertPoolMove({
    pool: "map",
    kind: "player_spend",
    amount: opts.amount,
    ref: opts.ref,
    note: opts.note,
  }).catch((err) => {
    // Дозаписи пула сорвались — деньги игрока уже ушли, отказывать в товаре
    // из-за этого нельзя. Логируем — админ увидит расхождение в аудите
    // (darai-pools.spent растёт медленнее ожидаемого) и добьёт вручную.
    console.warn("[pool] map player_spend не записан:", opts.ref, err);
  });
  return paid;
}
