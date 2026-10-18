// Балансы ресурсного счёта — ОДИН источник на всё приложение.
//
// Тот же урок, что и с энергией: у каждого экрана свой снимок = разные числа
// у одного и того же токена и кнопка, которая отказывает при достаточном
// балансе. Ключ здесь ровно тот, что уже читает панель счёта в админке.
import { useQuery } from "@tanstack/react-query";
import { getMyAccountBalances } from "@/server/api/currency/deposit";
import { getSession } from "@/server/api/user-auth";

export const ACC_BALANCES_KEY = ["acc-balances"] as const;

export type AccBalance = { token: string; balance: number };

const REFETCH_MS = 15_000;

/**
 * Счёт пока владельческий: `getMyAccountBalances` бросает всем остальным.
 * Поэтому запрос включается только когда сессия подтвердила права — иначе
 * каждый игрок ловил бы ошибку на каждом экране магазина.
 */
export function useAccountBalances() {
  const session = useQuery({ queryKey: ["session"], queryFn: () => getSession() });
  return useQuery({
    queryKey: ACC_BALANCES_KEY,
    queryFn: () => getMyAccountBalances(),
    enabled: session.data?.accountOpen === true,
    refetchInterval: REFETCH_MS,
    refetchOnWindowFocus: true,
    staleTime: 5_000,
    retry: false,
  });
}

/**
 * Открыт ли ресурсный счёт этому игроку. Решает сервер — по рубильнику
 * раскатки в настройках (account-rollout.ts).
 *
 * Гейт нужен и на клиенте: кнопка, которая всем видна и всем отвечает
 * «доступ запрещён», читается как поломка игры. Вчерашний ответ из кэша поля
 * не содержит — читаем строго на равенство true, а не «не false».
 */
export function useAccountEnabled(): boolean {
  const session = useQuery({ queryKey: ["session"], queryFn: () => getSession() });
  return session.data?.accountOpen === true;
}

/**
 * Баланс одного токена.
 *
 * `null` значит «ещё не знаем» — счёт не наш или данные не доехали; в этом
 * случае плашку баланса рисовать нельзя. `0` значит «знаем, что пусто».
 * Сравнение регистронезависимое: в базе токен встречается и как `Darai`,
 * и как `DARAI`.
 */
export function useAccountBalance(token: string | null | undefined): number | null {
  const q = useAccountBalances();
  if (!token || !q.data) return null;
  // Ответ мог прийти из вчерашнего кэша, где этого поля ещё не было.
  const rows = Array.isArray(q.data.balances) ? q.data.balances : [];
  const needle = token.trim().toLowerCase();
  const row = rows.find((b) => b.token.toLowerCase() === needle);
  return row ? row.balance : 0;
}
