// Кнопка «Мир креатора» на карте — рядом с замком (владелец, 07.11.2026: «в
// профиле — это очень далеко, нужно прям проще»). Только у права creator и у
// админа: тап — в свой мир (где был последним; своих нет — новый «Мир 1»), в
// мире креатора тот же тап — выйти туда, откуда пришёл. Новый мир, список,
// имя и «поделиться» — панель мира на карте (CreatorWorldBar).
import { useQuery } from "@tanstack/react-query";
import { Globe, Loader2, LogOut } from "lucide-react";
import { getSession } from "@/server/api/user-auth";
import { useCreatorAccess, useCreatorMove } from "./useCreator";

export function CreatorWorldButton({ ru }: { ru: boolean }) {
  const session = useQuery({ queryKey: ["session"], queryFn: () => getSession() });
  const can = session.data?.creator === true || session.data?.isAdmin === true;
  const access = useCreatorAccess(can);
  const move = useCreatorMove();
  if (!can || !access.data?.allowed) return null;
  const onWork = access.data.onWork;
  const label = onWork
    ? ru
      ? "Выйти из мира креатора"
      : "Leave creator world"
    : ru
      ? "Мир креатора"
      : "Creator world";
  const Icon = move.isPending ? Loader2 : onWork ? LogOut : Globe;
  return (
    <button
      type="button"
      className="raid-map-nav__button raid-map-nav__creator"
      aria-label={label}
      title={label}
      disabled={move.isPending}
      onClick={() => move.mutate(onWork ? { kind: "leave" } : { kind: "enter" })}
    >
      <Icon className={move.isPending ? "animate-spin" : undefined} aria-hidden="true" />
    </button>
  );
}
