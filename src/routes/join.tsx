// Мини-апка «Прихожая» — онбординг новичков как отдельное Telegram Mini App
// (путь A: свой бот + свой вход, общий бэкенд YupLink).
//
// Вход: авто-логин по Telegram initData (startHallwaySession) — новичку кош
// НЕ нужен, он получает лёгкую identity tg<id> и сразу знакомится с YupLand.
// Кош — одно из заданий прихожей, не барьер на входе.
//
// Layout — чистый (без основной навигации YupLink): это отдельное приложение.

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Sparkles } from "lucide-react";
import { HallwayBody } from "./hallway";
import { startHallwaySession } from "@/server/api/user-drops-hallway";
import { useAppStore } from "@/lib/store";

export const Route = createFileRoute("/join")({
  head: () => ({
    meta: [
      { title: "YupLink · Прихожая" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: JoinPage,
});

type Phase = "auth" | "ready" | "error";

/** Telegram.WebApp — минимальная типизация того, что используем. */
type TgWebApp = {
  initData?: string;
  initDataUnsafe?: { start_param?: string };
  ready?: () => void;
  expand?: () => void;
};
function getTg(): TgWebApp | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { Telegram?: { WebApp?: TgWebApp } }).Telegram
    ?.WebApp;
}

function JoinPage() {
  const qc = useQueryClient();
  const setWallet = useAppStore((s) => s.setWallet);
  const [phase, setPhase] = useState<Phase>("auth");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const tg = getTg();
      const initData = tg?.initData;
      if (!initData || initData.length < 20) {
        if (alive) {
          setErr("Открой прихожую через Telegram-бота");
          setPhase("error");
        }
        return;
      }
      try {
        tg?.ready?.();
        tg?.expand?.();
      } catch {
        /* необязательные вызовы TG */
      }
      const ref = tg?.initDataUnsafe?.start_param;
      try {
        const r = await startHallwaySession({ data: { initData, ref } });
        if (!alive) return;
        if (r.ok) {
          setWallet(r.wallet);
          await qc.invalidateQueries();
          setPhase("ready");
        } else {
          setErr(
            r.error === "bot_not_configured"
              ? "Бот прихожей ещё не настроен"
              : "Не удалось войти — попробуй позже"
          );
          setPhase("error");
        }
      } catch {
        if (alive) {
          setErr("Не удалось войти — попробуй позже");
          setPhase("error");
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [qc, setWallet]);

  if (phase === "ready") {
    return (
      <div className="min-h-[100dvh] bg-background pb-[max(1rem,env(safe-area-inset-bottom))]">
        <HallwayBody />
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-background px-6 text-center">
      {phase === "auth" ? (
        <>
          <Loader2 className="h-7 w-7 animate-spin text-gold" />
          <div className="text-sm text-muted-foreground">
            Заходим в прихожую…
          </div>
        </>
      ) : (
        <>
          <Sparkles className="h-8 w-8 text-gold" />
          <div className="font-display text-lg font-bold">
            Прихожая <span className="text-gradient-gold">YupLink</span>
          </div>
          <div className="max-w-xs text-sm text-muted-foreground">{err}</div>
        </>
      )}
    </div>
  );
}
