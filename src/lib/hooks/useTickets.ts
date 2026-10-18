// Билеты игрока — ОДИН кэш на всё приложение (как и энергия, см. useEnergy).
//
// Баланс меняется и без действий игрока: его лот купили на маркете, капнула
// ферма коллекции, крон догнал платёж. Раньше шапка перечитывала баланс только
// по инвалидации из 25 мест, поэтому доход «висел» невидимым, а первое же
// действие показывало его разом — игроки читали это как баг начисления
// (жалоба 23.08: «было 52, заклеймила 0.29 — стало 60»).
import { useQuery } from "@tanstack/react-query";
import { getMyTickets } from "@/server/api/user-tickets";

export const TICKETS_KEY = ["my-tickets"] as const;

/** Столько же, сколько у энергии: доход с маркета виден почти сразу. */
const REFETCH_MS = 15_000;

export function useTickets() {
  return useQuery({
    queryKey: TICKETS_KEY,
    queryFn: () => getMyTickets(),
    refetchInterval: REFETCH_MS,
    refetchOnWindowFocus: true,
    staleTime: 5_000,
  });
}
