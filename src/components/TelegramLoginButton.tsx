// Кнопка «Войти через Telegram» для ВЕБА (браузер вне Telegram).
//
// С 09.11.2026 кнопка своя (lib/auth/tgOauth): видна сразу и меняет язык без
// перезагрузки; нажатие открывает то же окно входа Telegram, что и виджет.
// Телеграм подписывает личность
// (HMAC ботом @yuplink_bot, домен привязан в BotFather), сервер проверяет
// подпись (loginViaTelegramWidget) и сажает сессию — БЕЗ кошелька. Это и есть
// «вход без коша»: Telegram = сама личность (identity-курс).
//
// В мини-апке виджет не нужен (там вход по initData через NearConnectorBridge) —
// поэтому внутри Telegram кнопку не показываем.
import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLang } from "@/lib/i18n";
import { toast } from "sonner";
import { useAppStore } from "@/lib/store";
import { loginViaTelegramWidget } from "@/server/api/user-telegram";
import { getTgLoginBotId } from "@/server/api/tg-login-bot";
import { openTgOauth, parseTgAuthHash, type TgAuthData } from "@/lib/auth/tgOauth";
import "./auth/login-buttons.css";

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
  const setWallet = useAppStore((s) => s.setWallet);
  const qc = useQueryClient();
  const lang = useLang();
  const [busy, setBusy] = useState(false);
  const [inTelegram] = useState(isInTelegram);
  const bot = useQuery({
    queryKey: ["tg-login-bot"],
    queryFn: () => getTgLoginBotId(),
    enabled: !inTelegram,
    staleTime: Infinity,
  });

  const login = useCallback(
    async (user: TgAuthData) => {
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
    },
    [setWallet, qc],
  );

  // Окно входа открылось переходом (телефон без всплывающих окон) — Telegram вернул
  // сюда с #tgAuthResult=…: забрать данные и убрать их из адреса.
  useEffect(() => {
    if (inTelegram) return;
    const data = parseTgAuthHash(window.location.hash);
    if (!data) return;
    history.replaceState(null, "", window.location.href.replace(/#.*$/, ""));
    void login(data);
  }, [inTelegram, login]);

  if (inTelegram) return null;
  const botId = bot.data?.botId ?? null;
  return (
    <div className="flex h-[46px] w-full items-center justify-center">
      <button
        type="button"
        className="tg-login-btn"
        aria-busy={busy}
        onClick={() => {
          if (!botId || busy) return;
          openTgOauth(botId, lang, (d) => d && void login(d));
        }}
      >
        <Send aria-hidden="true" />
        {lang === "ru" ? "Войти через Telegram" : "Log in with Telegram"}
      </button>
    </div>
  );
}
