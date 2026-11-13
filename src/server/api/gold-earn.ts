// Золото вместо билетов-наград (владелец, 20.10.2026, ПРАВИЛА §8.61): всё, что
// раньше НАЧИСЛЯЛО билеты — холд NFT, музей, рефералы, задания, боксы, босс,
// награды карты, подарки, обмен тренировочных фишек, — начисляет золото, 100 за
// билет. Сами числа в билетах (настройки событий, тиры, фонды) не трогаем:
// пересчёт — здесь, в одной точке.
//
// Ключ (вид, ref) база проводит один раз (res_move), поэтому ретрай и двойной
// клик не задваивают — тот же контракт, что был у ticket_move.
import { goldForEarnedTickets } from "@/lib/ticketGold";
import { goldMove } from "./gold-move";
import { accAccountId } from "./currency/move";

/**
 * Начислить золото вместо `tickets` билетов. Аккаунт — готовый или по кошельку
 * (с резолвером, как у билетов: без него золото уехало бы на сиротский счёт).
 * Возвращает, сколько золота начислено (0 — нечего начислять).
 */
export async function creditGoldForTickets(o: {
  wallet?: string | null;
  account?: string | null;
  tickets: number;
  kind: string;
  ref: string;
}): Promise<number> {
  const gold = goldForEarnedTickets(o.tickets);
  if (!(gold > 0)) return 0;
  const account = o.account || (o.wallet ? await accAccountId(o.wallet) : null);
  if (!account) throw new Error("Не найден аккаунт для кошелька");
  await goldMove(account, gold, o.kind, o.ref);
  return gold;
}
