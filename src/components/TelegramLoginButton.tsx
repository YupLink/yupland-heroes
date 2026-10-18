// Кнопка «Войти через Telegram» для ВЕБА (браузер вне Telegram).
//
// Рендерит официальный Telegram Login Widget: Телеграм подписывает личность
// (HMAC ботом @yuplink_bot, домен привязан в BotFather), сервер проверяет
// подпись (loginViaTelegramWidget) и сажает сессию — БЕЗ кошелька. Это и есть
// «вход без коша»: Telegram = сама личность (identity-курс).
//
// В мини-апке виджет не нужен (там вход по initData через NearConnectorBridge) —
// поэтому внутри Telegram кнопку не показываем.
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLang } from "@/lib/i18n";
import { toast } from "sonner";
import { useAppStore } from "@/lib/store";
import { loginViaTelegramWidget } from "@/server/api/user-telegram";

const BOT = "yuplink_bot";

interface TgUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

function currentRef(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return new URL(window.location.href).searchParams.get("ref") ?? undefined;
}

function isInTelegram(): boolean {
  if (typeof window === "undefined") return false;
  const tg = (window as unknown as { Telegram?: { WebApp?: { initData?: string } } }).Telegram;
  return !!tg?.WebApp?.initData;
}

export function TelegramLoginButton() {
  const host = useRef<HTMLDivElement | null>(null);
  const setWallet = useAppStore((s) => s.setWallet);
  const qc = useQueryClient();
  const lang = useLang();
  const [busy, setBusy] = useState(false);
  const [inTelegram] = useState(isInTelegram);
  // Виджет рисует Telegram со своего сервера — и при смене языка его надо
  // пересобрать заново. Секунд пять кнопки нет вовсе; вместо дырки в экране
  // держим её место заглушкой.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (inTelegram) return;
    const w = window as unknown as { onYupTelegramAuth?: (u: TgUser) => void };
    // Глобальный колбэк, который вызывает виджет Telegram после авторизации.
    w.onYupTelegramAuth = async (user: TgUser) => {
      setBusy(true);
      try {
        const res = await loginViaTelegramWidget({ data: { ...user, ref: currentRef() } });
        if (!res.ok) {
          toast.error("Не удалось войти через Telegram — попробуй ещё раз");
          return;
        }
        setWallet(res.wallet);
        qc.invalidateQueries();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Ошибка входа через Telegram");
      } finally {
        setBusy(false);
      }
    };
    const el = host.current;
    if (!el) return;
    el.innerHTML = "";
    setReady(false);
    const seen = new MutationObserver(() => {
      if (el.childElementCount > 1) setReady(true);
    });
    seen.observe(el, { childList: true });
    const s = document.createElement("script");
    s.async = true;
    s.src = "https://telegram.org/js/telegram-widget.js?22";
    s.setAttribute("data-telegram-login", BOT);
    // Надпись на кнопке рисует сам Telegram: без data-lang он берёт язык
    // браузера, и у русского телефона кнопка оставалась русской посреди
    // английского экрана.
    s.setAttribute("data-lang", lang);
    s.setAttribute("data-size", "large");
    s.setAttribute("data-radius", "14");
    s.setAttribute("data-onauth", "onYupTelegramAuth(user)");
    el.appendChild(s);
    return () => {
      seen.disconnect();
      el.innerHTML = "";
      delete w.onYupTelegramAuth;
    };
  }, [inTelegram, setWallet, qc, lang]);

  if (inTelegram) return null;

  return (
    <div className="relative flex w-full flex-col items-center">
      {!ready && (
        <div className="h-[46px] w-[238px] animate-pulse rounded-[14px] bg-[#54a9eb]/30" />
      )}
      <div
        ref={host}
        className={[
          busy ? "pointer-events-none opacity-60" : "",
          ready ? "" : "absolute opacity-0",
        ]
          .filter(Boolean)
          .join(" ")}
      />
    </div>
  );
}
