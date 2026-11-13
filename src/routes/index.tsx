// '/' — кошелёк («кош наоборот», одобрено владельцем 03.07): гость видит
// вход в кош, подключённый — кошелёк с переходом на главную сервиса (/home).
// Старый лендинг 1-в-1 живёт в components/LandingPage.tsx и рендерится на
// /home. Без beforeLoad-редиректов (они ломали клиентский роутинг).
//
// РОУТИНГ ЛЕНДИНГА:
//  • НОВЫЙ игрок (onboarding=true, любой ТГ → своя identity tg<id>) →
//    прихожая, а прошёл её (released) → сразу Фишки (/chips).
//  • ВЛАДЕЛЕЦ (isPayoutsAdmin) — тестовый режим по released-состоянию.
//  • АДМИН (isAdmin, не owner — напр. партнёр) — вход по своему
//    кошу как раньше, сразу в Фишки (прихожую пропускает).
//  • СТАРЫЕ юзеры (onboarding=false — все существующие) НЕ затрагиваются:
//    видят кошелёк как раньше.
//  • Открыто ботом КОШЕЛЬКА @yuplink_bot (владелец 20.10) — только кошелёк, без
//    переходов в игру: в игру ведёт свой бот @yupland_heroes_bot (сразу /chips).
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { WalletHome } from "@/components/WalletHome";
import { useAppStore } from "@/lib/store";
import { getSession } from "@/server/api/user-auth";
import { getMyHallwayState } from "@/server/api/hallway";
import { tgLoginPending, useTgLogin } from "@/lib/auth/telegramLogin";
import { GuestEntry } from "@/components/auth/GuestEntry";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "YupLand Heroes" },
      { name: "description", content: "YupLand Heroes — игра: герои, рейды, шахты и замок." },
    ],
  }),
  component: WalletEntry,
});

function WalletEntry() {
  const { walletConnected } = useAppStore();
  const navigate = useNavigate();
  const session = useQuery({ queryKey: ["session"], queryFn: () => getSession() });
  const tgPending = tgLoginPending(useTgLogin((s) => s.state));
  const walletBot = useTgLogin((s) => s.bot) === "wallet";
  const isOwner = !!session.data?.isPayoutsAdmin;
  const isAdmin = !!session.data?.isAdmin && !isOwner; // админ, но не owner
  const isNew = !!session.data?.onboarding; // новый игрок (пришёл через прихожую)
  const inHallway = !!session.data?.inHallway; // новый и ещё не выпущен
  // Прихожа-состояние тянем ТОЛЬКО для владельца (тест-режим).
  const hallway = useQuery({
    queryKey: ["hallway-state"],
    queryFn: () => getMyHallwayState(),
    enabled: isOwner,
  });

  useEffect(() => {
    if (import.meta.env.DEV) {
      navigate({ to: "/hallway" });
      return;
    }
    // В Telegram сперва узнаём, какой бот открыл приложение: кошельковый никуда не ведёт.
    if (session.isLoading || tgPending || walletBot) return;
    if (isOwner) {
      if (hallway.isLoading) return;
      navigate({ to: hallway.data?.released ? "/chips" : "/hallway" });
      return;
    }
    // Админ (напр. партнёр) — вход по кошу как раньше, сразу в Фишки.
    if (isAdmin) {
      navigate({ to: "/chips" });
      return;
    }
    // Новый игрок: не выпущен → прихожая, выпущен → Фишки.
    if (isNew) {
      navigate({ to: inHallway ? "/hallway" : "/chips" });
      return;
    }
    // Старый игрок → кошелёк (поведение не меняем).
  }, [
    navigate,
    session.isLoading,
    isOwner,
    isAdmin,
    isNew,
    inHallway,
    hallway.isLoading,
    hallway.data?.released,
    tgPending,
    walletBot,
  ]);

  // Пока сессия грузится (в т.ч. идёт ТГ-логин) — лоадер, чтобы не мигать
  // экраном «Войти с кошельком». Владельцу и новым тоже лоадер (редирект).
  const redirecting = !walletBot && (isOwner || isAdmin || isNew);
  if (import.meta.env.DEV || redirecting || session.isLoading || (tgPending && !walletConnected)) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  // Гость — игровой экран входа: в Telegram вход идёт сам (не прошёл — «Повторить»),
  // в браузере — «YupLand Heroes» и одна кнопка домена: service — Google, tg.service —
  // Telegram, near.service — кошелёк NEAR (владелец, 11.11.2026, §8.127).
  return walletConnected ? <WalletHome /> : <GuestEntry />;
}
