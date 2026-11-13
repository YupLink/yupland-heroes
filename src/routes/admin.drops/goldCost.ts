// Цена платного клейма в админке дропов — в ЗОЛОТЕ (ПРАВИЛА §8.61), а в базе
// прежнее ticket_cost в билетах: игрок платит goldForTicketPrice(ticket_cost),
// то есть 500 золота за билет. Поле принимает золото, при сохранении делим.
// campaigns.ticket_cost и redemptions.ticket_cost — integer: дробь база
// округлит (0.2 → 0 = бесплатный дроп), поэтому цена — только целые билеты,
// поле кратно 500 золота.
import { TICKET_SPEND_GOLD, goldForTicketPrice } from "@/lib/ticketGold";

/** Золото по умолчанию в поле цены (= прежний 1 билет). */
export const DEFAULT_CLAIM_GOLD = String(TICKET_SPEND_GOLD);

/** Поле «золото» → ticket_cost (целые билеты, не меньше 1 = 500 золота). */
export function ticketCostFromGold(gold: string | number): number {
  const g = Number(String(gold).replace(",", "."));
  if (!Number.isFinite(g) || g <= 0) return 1;
  return Math.max(1, Math.round(g / TICKET_SPEND_GOLD));
}

/** ticket_cost из базы → золото для поля и подписи. */
export function goldFromTicketCost(tickets: number | null | undefined): number {
  return goldForTicketPrice(tickets ?? 1);
}

/** Поле после ввода: золото, которое реально уйдёт в базу (кратно 500). */
export function snapClaimGold(gold: string): string {
  return String(goldFromTicketCost(ticketCostFromGold(gold)));
}
