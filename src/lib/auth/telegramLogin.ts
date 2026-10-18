// Вход по Telegram в мини-апке (initData) — первым и без кошелька (17.10.2026).
//
// Раньше этот вход шёл в NearConnectorBridge ПОСЛЕ загрузки библиотеки NEAR-кошелька:
// пока она грузилась (или если не загрузилась) у новичка не было сессии, и экран
// показывал «Подключи кошелёк». Игрок = аккаунт на Telegram, кошелёк для входа не нужен.
// Состояние входа общее для экранов: пока идёт вход — заставка, не удалось — «Повторить».
import { create } from "zustand";
import type { QueryClient } from "@tanstack/react-query";
import { loginViaTelegramInitData } from "@/server/api/user-telegram";
import { useAppStore } from "@/lib/store";
import { resetAccountQueries } from "./resetAccountQueries";

/** skipped — у Telegram нет своего аккаунта (вход кошельком устройства, Ярослав). */
export type TgLoginState = "idle" | "pending" | "ok" | "skipped" | "failed";

/** wallet — аккаунт, в который вошли по Telegram (авторитетный: кош не может его сменить). */
export const useTgLogin = create<{
  state: TgLoginState;
  error: string | null;
  wallet: string | null;
}>(() => ({ state: "idle", error: null, wallet: null }));

type WebApp = { initData?: string; platform?: string };

function webApp(): WebApp | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { Telegram?: { WebApp?: WebApp } }).Telegram?.WebApp;
}

/** Открыто внутри Telegram-мини-апки с данными для входа. */
export function inTelegramMiniApp(): boolean {
  const tg = webApp();
  return !!(tg?.initData && tg.platform && tg.platform !== "unknown");
}

/** Вход по Telegram ещё идёт (или вот-вот начнётся) — экрану ждать, а не просить кошелёк. */
export function tgLoginPending(state: TgLoginState): boolean {
  return state === "pending" || (state === "idle" && inTelegramMiniApp());
}

function refParam(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return new URL(window.location.href).searchParams.get("ref") ?? undefined;
}

/** Через сколько показать «не получилось» на плохой сети. Сам запрос не обрываем:
 *  поздний ответ всё равно применится (сервер к тому времени уже поставил куку). */
const ATTEMPT_MS = 20_000;

export type TgLoginResult = { result: "ok" | "skipped" | "failed" | "none"; wallet?: string };

let running: Promise<TgLoginResult> | null = null;

let slow: ReturnType<typeof setTimeout> | null = null;

/** Пока ответа нет — «вход идёт»; через 20 с без ответа — «не получилось» (запрос живёт дальше). */
function markPending(): void {
  useTgLogin.setState({ state: "pending", error: null });
  if (slow) clearTimeout(slow);
  slow = setTimeout(() => {
    if (useTgLogin.getState().state === "pending") {
      useTgLogin.setState({ state: "failed", error: "timeout" });
    }
  }, ATTEMPT_MS);
}

/** Войти по initData. Повторный вызов во время входа ждёт тот же вход (и снова показывает «идёт»). */
export function runTelegramLogin(qc: QueryClient): Promise<TgLoginResult> {
  if (running) {
    markPending();
    return running;
  }
  running = attempt(qc).finally(() => {
    running = null;
    if (slow) clearTimeout(slow);
    slow = null;
  });
  return running;
}

async function attempt(qc: QueryClient): Promise<TgLoginResult> {
  const initData = webApp()?.initData;
  if (!initData || !inTelegramMiniApp()) return { result: "none" };
  markPending();
  let error = "network";
  try {
    for (let i = 0; i < 2; i++) {
      try {
        const res = await loginViaTelegramInitData({ data: { initData, ref: refParam() } });
        if (res.ok && res.wallet) {
          // Сменился аккаунт → сброс чужого кэша; тот же — ничего не трогаем, иначе
          // замок вернувшегося игрока размонтировался бы на ровном месте.
          if (useAppStore.getState().walletAddress !== res.wallet) {
            void resetAccountQueries(qc);
            useAppStore.getState().setWallet(res.wallet);
            void qc.invalidateQueries();
          }
          useTgLogin.setState({ state: "ok", error: null, wallet: res.wallet });
          return { result: "ok", wallet: res.wallet };
        }
        if (!res.ok && res.error === "no_wallet_linked") {
          useTgLogin.setState({ state: "skipped", error: null });
          return { result: "skipped" };
        }
        error = (!res.ok && res.error) || "unknown";
        break; // явный отказ сервера — повтор не поможет
      } catch {
        error = "network";
      }
    }
  } finally {
    if (slow) clearTimeout(slow);
  }
  useTgLogin.setState({ state: "failed", error });
  return { result: "failed" };
}
