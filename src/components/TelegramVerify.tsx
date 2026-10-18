import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getSession } from "@/server/api/user-auth";
import { createTgChallenge, linkTelegram } from "@/server/api/user-telegram";
import { Send, ExternalLink, Loader2 } from "lucide-react";
import { humanError } from "@/lib/humanError";
import { useLang } from "@/lib/i18n";

interface TgInitDataAuth {
  id: number;
  first_name?: string;
  username?: string;
  auth_date: number;
  hash: string;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string;
        initDataUnsafe?: {
          user?: { id: number; first_name?: string; username?: string };
          hash?: string;
          auth_date?: number;
        };
      };
    };
  }
}

/** context="profile" — профиль замка: подпись про промокоды вместо правил NFT. */
export function TelegramVerify({ context }: { context?: "profile" } = {}) {
  const ru = useLang() === "ru";
  const qc = useQueryClient();
  const [linkUrl, setLinkUrl] = useState<string | null>(null);
  const [waitingForBot, setWaitingForBot] = useState(false);

  // Mini App-режим: если страница открыта внутри Telegram, initData уже подписан
  const link = useMutation({
    mutationFn: (data: TgInitDataAuth) => linkTelegram({ data }),
    onSuccess: (res) => {
      const u = res.username ? `@${res.username}` : "Telegram";
      toast.success(`${u} успешно привязан`);
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  // Основной путь: бот + /start <nonce>
  const challenge = useMutation({
    mutationFn: () => createTgChallenge({}),
    onSuccess: ({ link }) => {
      setLinkUrl(link);
      setWaitingForBot(true);
      window.open(link, "_blank", "noopener");
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  // Поллинг: после открытия бота ждём, пока сервер не увидит привязку
  const session = useQuery({
    queryKey: ["session"],
    queryFn: () => getSession(),
    refetchInterval: waitingForBot ? 2000 : false,
  });

  useEffect(() => {
    if (!waitingForBot) return;
    if (session.data?.telegramLinked) {
      setWaitingForBot(false);
      toast.success("Telegram привязан");
      qc.invalidateQueries();
    } else if (session.data?.tgError) {
      // Бот зафейлил привязку (коллизия и т.п.) — показываем юзеру и сбрасываем
      setWaitingForBot(false);
      setLinkUrl(null);
      toast.error(session.data.tgError);
    }
  }, [waitingForBot, session.data?.telegramLinked, session.data?.tgError, qc]);

  // Если внутри Mini App — попробуем сразу через initData
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg?.initDataUnsafe?.user && tg.initDataUnsafe.hash && tg.initDataUnsafe.auth_date) {
      const u = tg.initDataUnsafe.user;
      link.mutate({
        id: u.id,
        first_name: u.first_name,
        username: u.username,
        auth_date: tg.initDataUnsafe.auth_date,
        hash: tg.initDataUnsafe.hash,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="rounded-3xl border border-gold/30 bg-gold/5 p-6 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl gradient-gold shadow-gold">
        <Send className="h-7 w-7 text-gold-foreground" />
      </div>
      <h3 className="font-display text-xl font-bold">Подтверди Telegram</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        {context === "profile"
          ? ru
            ? "Привяжи Telegram к кошельку, чтобы использовать промокоды. Список друзей доступен и без подтверждения."
            : "Link Telegram to your wallet to use promo codes. You can view your friends without verification."
          : "Кошелёк привязывается к твоему Telegram навсегда. К одному Telegram можно привязать несколько кошельков — награды и билеты считаются вместе. Без подтверждения нельзя погашать NFT и видеть свой раздел."}
      </p>

      {waitingForBot ? (
        <div className="mt-5 flex flex-col items-center gap-3">
          <div className="inline-flex items-center gap-2 text-sm text-gold">
            <Loader2 className="h-4 w-4 animate-spin" />
            Ждём подтверждения от бота…
          </div>
          {linkUrl && (
            <a
              href={linkUrl}
              target="_blank"
              rel="noopener"
              className="text-xs text-muted-foreground underline transition hover:text-gold"
            >
              Открыть бота снова
            </a>
          )}
          <button
            onClick={() => {
              setWaitingForBot(false);
              setLinkUrl(null);
            }}
            className="text-[11px] text-muted-foreground transition hover:text-foreground"
          >
            Отменить
          </button>
        </div>
      ) : (
        <button
          onClick={() => challenge.mutate({})}
          disabled={challenge.isPending}
          className="mt-5 inline-flex items-center gap-2 rounded-full gradient-gold px-5 py-3 text-sm font-bold text-gold-foreground shadow-gold transition hover:scale-105 disabled:opacity-60"
        >
          {challenge.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ExternalLink className="h-4 w-4" />
          )}
          Подтвердить через бота
        </button>
      )}

      <p className="mt-3 text-[11px] text-muted-foreground">
        Откроется бот @yuplink_bot — нажми «Start».
      </p>
    </div>
  );
}
