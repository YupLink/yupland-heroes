// Оплата клейма: сначала деньги, потом товар.
//
// Паки и NFT-призы выдаются необратимо (пак уже в инвентаре, приз уже занят в
// пуле), поэтому списывать ПОСЛЕ выдачи нельзя: отказ оплаты оставлял товар
// бесплатным. Здесь пара «списать / вернуть», чтобы порядок был одинаков во
// всех видах дропов — простом, комбо, за фишку и за энергию.
//
// С 20.10.2026 (ПРАВИЛА §8.61) билетов нет: цена дропа по-прежнему хранится в
// билетах (redemption_campaigns.ticket_cost), а платится золотом ×500
// (goldForTicketPrice), вид операции drop_claim.
import { goldForTicketPrice } from "@/lib/ticketGold";
import { accAccountId } from "./currency/move";
import { goldMove, goldOf, goldRefund } from "./gold-move";

/** Вид операции золота за участие в платном дропе. */
export const CLAIM_GOLD_KIND = "drop_claim";

/**
 * Списать цену клейма (`cost` — в билетах, как в дропе). `false` — золота нет
 * (или ключ уже израсходован): выдавать нечего, вызывающий выходит из итерации.
 *
 * `ref` обязан быть уникальным глобально: (вид, ключ) в журнале один на всю
 * таблицу, поэтому в ключ идёт id записи участия (nanoid), а не номер набора.
 */
export async function debitClaim(opts: {
  wallet: string;
  cost: number;
  ref: string;
}): Promise<boolean> {
  const gold = goldForTicketPrice(opts.cost);
  if (!(gold > 0)) return true;
  const account = await accAccountId(opts.wallet).catch(() => null);
  if (!account) return false;
  return goldMove(account, -gold, CLAIM_GOLD_KIND, opts.ref).catch(() => false);
}

/** Вернуть цену, если товар в итоге не выдался (вид drop_claim_undo, тот же ключ). */
export async function refundClaim(opts: {
  wallet: string;
  cost: number;
  ref: string;
}): Promise<void> {
  const gold = goldForTicketPrice(opts.cost);
  if (!(gold > 0)) return;
  const account = await accAccountId(opts.wallet).catch(() => null);
  if (!account) return;
  await goldRefund(account, gold, CLAIM_GOLD_KIND, opts.ref);
}

/**
 * Сколько клеймов по цене `cost` (в билетах) игрок может оплатить золотом.
 * Не хватает даже на один — бросает «Не хватает золота: нужно N, у тебя M»
 * (humanError переводит её на английский).
 */
export async function claimBudget(wallet: string, cost: number): Promise<number> {
  const price = goldForTicketPrice(cost);
  if (!(price > 0)) return Number.POSITIVE_INFINITY;
  const account = await accAccountId(wallet);
  const have = account ? await goldOf(account) : 0;
  if (have < price) {
    throw new Error(`Не хватает золота: нужно ${price}, у тебя ${Math.floor(have)}`);
  }
  return Math.floor(have / price);
}
