import { useEffect } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getSession } from "@/server/api/user-auth";
import { applyClientLang } from "@/lib/store";
import { enterMobileFullscreen, type TgFullscreenApi } from "@/lib/telegram/mobileFullscreen";

// Если кошелёк подключён, но Telegram не привязан — выкидываем юзера на
// страницу с TelegramVerify-блоком. Раньше это была '/', теперь лендинг
// живёт на /home ('/' = кошелёк, «кош наоборот») — редиректим на /home.
// Без TG нельзя ходить в /my-nfts и /referrals.
//
// Разрешены без TG: '/' (кошелёк — не сервис), /home (там сам блок
// привязки), /wallet/* (кош-флоу: создание/подпись/доки), /admin/*
// (админ-флоу делает свою проверку прав в auth.ts).
export function TgGuard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: session } = useQuery({
    queryKey: ["session"],
    queryFn: () => getSession(),
  });

  // Применяем реальный язык устройства/localStorage ПОСЛЕ монтирования — стор
  // стартует с "ru" (как SSR), иначе англоязычные устройства ловили hydration
  // mismatch (React #418), из-за которого в Safari переставали работать кнопки
  // (в т.ч. «Подключить кошелёк»). Здесь re-render уже вне гидрации — безопасно.
  useEffect(() => {
    applyClientLang();
  }, []);

  // Telegram Mini App: раскрыть на ПОЛНУЮ высоту при старте. На iPhone мини-апп
  // открывается наполовину, и юзеру приходится тянуть вручную — expand() тянет
  // до максимума; disableVerticalSwipes (Bot API 7.7+) не даёт свайпу вниз
  // сворачивать. Телефон и планшет (iOS/Android): рамки Telegram или весь экран —
  // выбор в профиле («Рамки Telegram»); по умолчанию телефон с рамками, планшет
  // во весь экран, иначе игра в окошке размером с телефон (mobileFullscreen.ts).
  // Вне Telegram window.Telegram нет → no-op (браузер).
  useEffect(() => {
    const tg = (
      window as unknown as {
        Telegram?: {
          WebApp?: TgFullscreenApi & {
            ready?: () => void;
            expand?: () => void;
            disableVerticalSwipes?: () => void;
          };
        };
      }
    ).Telegram?.WebApp;
    if (!tg) return;
    try {
      tg.ready?.();
      tg.expand?.();
      tg.disableVerticalSwipes?.();
      enterMobileFullscreen(tg);
    } catch {
      /* старый клиент Telegram — метода нет */
    }
  }, []);

  useEffect(() => {
    // Смягчение (по требованию): без TG можно СМОТРЕТЬ всё — /my-nfts,
    // /referrals и т.д. показывают баннер «Подтверди TG», а собирать награды
    // не даст сервер (requireLinkedTelegram в клейм-функциях). Жёсткий
    // выброс на главную убран — он выглядел как «ничего не работает».
    // Прихожа v2: онбординг-новичок (зашёл через прихожу, ещё не выпущен)
    // заперт в прихоже. Старые/выпущенные inHallway=false → не редиректятся.
    if (!session?.inHallway || session.isAdmin) return;
    const p = location.pathname;
    const allowed =
      p.startsWith("/hallway") ||
      p.startsWith("/join") ||
      p.startsWith("/wallet") ||
      p.startsWith("/admin");
    if (!allowed) navigate({ to: "/hallway" });
  }, [session, location, navigate]);

  return null;
}
