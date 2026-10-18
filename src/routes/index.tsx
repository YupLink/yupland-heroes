// '/' — кошелёк («кош наоборот», одобрено владельцем 03.07): гость видит
// вход в кош, подключённый — кошелёк с переходом на главную сервиса (/home).
// Старый лендинг 1-в-1 живёт в components/LandingPage.tsx и рендерится на
// /home. Без beforeLoad-редиректов (они ломали клиентский роутинг).
//
// РОУТИНГ ЛЕНДИНГА:
//  • НОВЫЙ игрок (onboarding=true, любой ТГ → своя identity tg<id>) →
//    прихожая, а прошёл её (released) → сразу Фишки (/chips).
//  • ВЛАДЕЛЕЦ (isPayoutsAdmin=miplix) — тестовый режим по released-состоянию.
//  • АДМИН (isAdmin, не owner — напр. Ярослав/100000002) — вход по своему
//    кошу как раньше, сразу в Фишки (прихожую пропускает).
//  • СТАРЫЕ юзеры (onboarding=false — все существующие) НЕ затрагиваются:
//    видят кошелёк как раньше.
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { WalletHome, WalletWelcome } from "@/components/WalletHome";
import { useAppStore } from "@/lib/store";
import { getSession } from "@/server/api/user-auth";
import { getMyHallwayState } from "@/server/api/hallway";
import { inTelegramMiniApp, tgLoginPending, useTgLogin } from "@/lib/auth/telegramLogin";
import { GuestEntry } from "@/components/auth/GuestEntry";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "YupLink Кошелёк" },
      {
        name: "description",
        content:
          "Некастодиальный NEAR-кошелёк YupLink: ключ только у тебя. Вход в дропы, фишки и лотерею экосистемы Golden Darai.",
      },
    ],
  }),
  component: WalletEntry,
});

function WalletEntry() {
  const { walletConnected } = useAppStore();
  const navigate = useNavigate();
  const session = useQuery({ queryKey: ["session"], queryFn: () => getSession() });
  const tgPending = tgLoginPending(useTgLogin((s) => s.state));
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
    if (session.isLoading) return;
    if (isOwner) {
      if (hallway.isLoading) return;
      navigate({ to: hallway.data?.released ? "/chips" : "/hallway" });
      return;
    }
    // Админ (Ярослав/100000002) — вход по кошу как раньше, сразу в Фишки.
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
  ]);

  // Пока сессия грузится (в т.ч. идёт ТГ-логин) — лоадер, чтобы не мигать
  // экраном «Войти с кошельком». Владельцу и новым тоже лоадер (редирект).
  if (import.meta.env.DEV || isOwner || isAdmin || isNew || session.isLoading || (tgPending && !walletConnected)) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  // В Telegram вход идёт сам; не прошёл — «Повторить», а не экран кошелька (17.10).
  if (!walletConnected && inTelegramMiniApp()) return <GuestEntry />;
  return walletConnected ? <WalletHome /> : <WalletWelcome />;
}
