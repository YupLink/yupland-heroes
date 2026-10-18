// Экран гостя (нет входа) — вход через Telegram, а не «Подключи кошелёк» (17.10.2026).
// Игрок = аккаунт на Telegram: в мини-апке вход идёт сам (telegramLogin), здесь только
// «Повторить», если не прошёл по сети, или «открыть заново», если Telegram отказал
// (данные входа устарели); в браузере — кнопка Telegram. Входа «одним кошельком» нет
// (владелец, 18.10.2026): кошелёк добавляется к Telegram с подписью, уже в игре.
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import yupikStill from "@/assets/loading/yupik-still.webp";
import { useLang } from "@/lib/i18n";
import { inTelegramMiniApp, runTelegramLogin, useTgLogin } from "@/lib/auth/telegramLogin";
import { TelegramLoginButton } from "@/components/TelegramLoginButton";
import "@/components/game/game-load-state.css";

const closeMiniApp = () =>
  (
    window as unknown as { Telegram?: { WebApp?: { close?: () => void } } }
  ).Telegram?.WebApp?.close?.();

export function GuestEntry() {
  const ru = useLang() === "ru";
  const qc = useQueryClient();
  const tg = useTgLogin();
  const [inTelegram] = useState(inTelegramMiniApp);
  const pending = tg.state === "pending";
  const failed = inTelegram && tg.state === "failed";
  // Сеть или долгий ответ — поможет повтор; отказ Telegram (устарели данные входа) — нет.
  const retryable = !failed || tg.error === "network" || tg.error === "timeout";
  const title = !failed
    ? ru
      ? "Вход в игру"
      : "Sign in to play"
    : retryable
      ? ru
        ? "Не получилось войти через Telegram"
        : "Telegram sign-in failed"
      : ru
        ? "Закрой и открой игру заново"
        : "Close and reopen the game";
  return (
    <>
      <section className="game-load-state game-load-state--fullscreen game-load-state--inactive">
        <div className="game-load-state__scene">
          <img
            className="game-load-state__runner game-load-state__runner--still"
            src={yupikStill}
            alt=""
            aria-hidden="true"
          />
          <div className="game-load-state__message">
            <h1 role={failed ? "alert" : "status"}>{title}</h1>
            <div className="game-load-state__actions">
              {!inTelegram ? (
                <TelegramLoginButton />
              ) : retryable ? (
                <button
                  type="button"
                  className="game-load-state__retry"
                  disabled={pending}
                  onClick={() => void runTelegramLogin(qc)}
                >
                  {pending && <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />}
                  {ru ? "Повторить" : "Retry"}
                </button>
              ) : (
                <button type="button" className="game-load-state__retry" onClick={closeMiniApp}>
                  {ru ? "Закрыть" : "Close"}
                </button>
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
