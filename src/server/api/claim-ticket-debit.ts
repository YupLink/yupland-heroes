// Оплата клейма билетами: сначала деньги, потом товар.
//
// Паки и NFT-призы выдаются необратимо (пак уже в инвентаре, приз уже занят в
// пуле), поэтому списывать билеты ПОСЛЕ выдачи нельзя: отказ оплаты оставлял
// товар бесплатным. Здесь пара «списать / вернуть», чтобы порядок был одинаков
// во всех видах дропов — простом, комбо и за фишку.
import type { TicketKind } from "./tickets-ledger";

/**
 * Списать цену клейма. `false` — денег нет (или ключ уже израсходован):
 * выдавать нечего, вызывающий обязан выйти из итерации.
 *
 * `ref` обязан быть уникальным глобально: индекс на (kind, ref) один на всю
 * таблицу, поэтому в ключ идёт id записи участия (nanoid), а не номер набора.
 */
export async function debitClaim(opts: {
  wallet: string;
  cost: number;
  ref: string;
  kind?: TicketKind;
}): Promise<boolean> {
  if (!(opts.cost > 0)) return true;
  const { moveTickets } = await import("./tickets-ledger");
  const r = await moveTickets({
    wallet: opts.wallet,
    delta: -opts.cost,
    kind: opts.kind ?? "redemption",
    ref: opts.ref,
  }).catch(() => ({ applied: false }) as { applied: boolean });
  return r.applied;
}

/** Вернуть цену, если товар в итоге не выдался. Ключ возврата — свой. */
export async function refundClaim(opts: {
  wallet: string;
  cost: number;
  ref: string;
}): Promise<void> {
  if (!(opts.cost > 0)) return;
  const { moveTickets } = await import("./tickets-ledger");
  await moveTickets({
    wallet: opts.wallet,
    delta: opts.cost,
    kind: "refund",
    ref: `${opts.ref}:undo`,
  }).catch(() => undefined);
}
