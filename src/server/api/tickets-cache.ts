// Кэш баланса билетов — ОДИН на всё приложение.
//
// Раньше таких Map было две (user-claims-types и user-tickets-shared), и они
// жили независимо: хендлеры после операции сбрасывали кэш через ./user, а
// шапка читала getMyTickets из второго модуля — то есть из другой Map, которую
// никто не чистил. Игрок до 5 секунд видел прежнее число.
//
// Модуль сознательно без зависимостей: его импортируют оба слоя, и любая
// лишняя связь тут же дала бы цикл.
export type TicketsResult = {
  total: number;
  used: number;
  available: number;
  availableRaw: number;
  earnedFromReferrals: number;
  earnedFromTasks: number;
  earnedFromTicketEvents: number;
  earnedFromPurchases: number;
};

export const TICKETS_TTL_MS = 5_000;

export const _ticketsCache = new Map<string, { value: TicketsResult; at: number }>();

export function invalidateTicketsCache(wallet: string | string[]): void {
  const list = Array.isArray(wallet) ? wallet : [wallet];
  for (const w of list) _ticketsCache.delete(w);
}
