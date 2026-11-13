// Правила аккаунта для окон (§8.127): звёзды, «только Google», кнопки вывода.
// Читает ту же сессию, что и остальные окна (ключ ["session"]).
import { useQuery } from "@tanstack/react-query";
import { getSession } from "@/server/api/user-auth";
import { googleOnly, starsAllowed } from "@/lib/auth/entryRules";

export type EntryRules = {
  ready: boolean;
  /** Звёзды Telegram показывать. */
  stars: boolean;
  /** Аккаунт только с Google: ни Telegram, ни ввода и вывода. */
  googleOnly: boolean;
  /** Кнопки вывода грузить (белый список). */
  canWithdraw: boolean;
};

export function useEntryRules(): EntryRules {
  const s = useQuery({ queryKey: ["session"], queryFn: () => getSession() });
  const tg = s.data?.telegramId ?? null;
  return {
    ready: !!s.data,
    stars: starsAllowed(tg),
    googleOnly: googleOnly(tg),
    canWithdraw: s.data?.canWithdraw === true,
  };
}
