// Экран гостя (нет входа) — вход через Telegram, а не «Подключи кошелёк» (17.10.2026).
// Игрок = аккаунт на Telegram: в мини-апке вход идёт сам (telegramLogin), здесь только
// «Повторить», если не прошёл по сети, или «открыть заново», если Telegram отказал
// (данные входа устарели); в браузере — кнопка Telegram. Входа «одним кошельком» нет
// (владелец, 18.10.2026): кошелёк добавляется к Telegram с подписью, уже в игре.
// Браузер (владелец, 09.11.2026): этот же экран и на '/', вместо «YupLink Wallet» —
// «YupLand Heroes». Три входа (11.11.2026, §8.127): у каждого домена одна кнопка —
// service.yupland.io — Google, tg.service.yupland.io — Telegram, near.service.yupland.io —
// кошелёк NEAR (домен знает сервер: session.entry). В мини-апке — как было.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSession } from "@/server/api/user-auth";
import type { EntryKind } from "@/lib/auth/entryHost";
import { Loader2 } from "lucide-react";
import yupikStill from "@/assets/loading/yupik-still.webp";
import { useLang } from "@/lib/i18n";
import { inTelegramMiniApp, runTelegramLogin, useTgLogin } from "@/lib/auth/telegramLogin";
import { TelegramLoginButton } from "@/components/TelegramLoginButton";
import { InviteLine } from "@/components/referrals/InviteLine";
import { GoogleLoginButton } from "@/components/auth/GoogleLoginButton";
import { LangSwitch } from "@/components/LangSwitch";
import { WalletLoginButton } from "@/components/auth/WalletLoginButton";
import "@/components/game/game-load-state.css";

const closeMiniApp = () =>
  (
    window as unknown as { Telegram?: { WebApp?: { close?: () => void } } }
  ).Telegram?.WebApp?.close?.();

export type EntryPage = EntryKind;

export function GuestEntry({ entry: forced }: { entry?: EntryPage }) {
  const session = useQuery({ queryKey: ["session"], queryFn: () => getSession() });
  const entry: EntryPage = forced ?? session.data?.entry ?? "google";
  const ru = useLang() === "ru";
  const qc = useQueryClient();
  const tg = useTgLogin();
  const [inTelegram] = useState(inTelegramMiniApp);
  const pending = tg.state === "pending";
  const failed = inTelegram && tg.state === "failed";
  // Сеть или долгий ответ — поможет повтор; отказ Telegram (устарели данные входа) — нет.
  const retryable = !failed || tg.error === "network" || tg.error === "timeout";
  const title = !inTelegram
    ? "YupLand Heroes"
    : !failed
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
            {!inTelegram && <InviteLine />}
            <div className="game-load-state__actions">
              {!inTelegram ? (
                <>
                  {entry === "tg" && <TelegramLoginButton />}
                  {entry === "google" && <GoogleLoginButton />}
                  {entry === "near" && <WalletLoginButton entry="near" />}
                  <LangSwitch variant="pill" className="game-load-state__lang mx-auto mt-1" />
                </>
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
