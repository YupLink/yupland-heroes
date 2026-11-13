// Друзья и задания — страница игроков /referrals в прежнем виде. В профиле
// замка (только админы, 07.10.2026) — версия Ангелины, castle-live/CastleReferrals;
// эта уйдёт, когда замок откроется всем.
import { RefShareButton } from "./RefShareButton";
import { copyText } from "@/lib/copyText";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getSession } from "@/server/api/user-auth";
import { getMyTickets } from "@/server/api/user-tickets";
import { useResources } from "@/lib/hooks/useResources";
import { goldForEarnedTickets } from "@/lib/ticketGold";
import { getReferralStats } from "@/server/api/user-referrals";
import { listMyTasks, verifyTaskCompletion } from "@/server/api/user-tasks";
import { TelegramVerify } from "@/components/TelegramVerify";
import { Copy, Check, Users, Coins, ListChecks } from "lucide-react";
import { useT, useLang } from "@/lib/i18n";
import { humanError } from "@/lib/humanError";
import { ReferralDetails } from "./ReferralDetails";
import { TaskCard } from "./ReferralTaskCard";
import { ReferralRewards } from "./ReferralRewards";
import { REF_REWARDS_KEY } from "./useReferralRewards";
import { RefGoldCard } from "@/components/referrals/RefGoldCard";

export function CastleReferrals() {
  const t = useT();
  const ru = useLang() === "ru";
  const stats = useQuery({
    queryKey: ["referral-stats"],
    queryFn: () => getReferralStats(),
  });
  // Без TG смотреть можно, действия закрыты сервером — показываем баннер.
  const sessionQ = useQuery({
    queryKey: ["session"],
    queryFn: () => getSession(),
  });
  const needsTg = !!sessionQ.data?.wallet && !sessionQ.data.telegramLinked;

  // Билетов нет (ПРАВИЛА §8.61): показываем золото; прежние билеты «от
  // рефералов / заданий» — золотом ×100, как их теперь и начисляют.
  const tickets = useQuery({
    queryKey: ["my-tickets"],
    queryFn: () => getMyTickets(),
  });
  const resources = useResources();

  const myTasks = useQuery({
    queryKey: ["my-tasks"],
    queryFn: () => listMyTasks(),
  });

  const qc = useQueryClient();
  // Статистика может засчитать новый этап — он заводит бонус-бокс (22.10.2026).
  useEffect(() => {
    if (stats.dataUpdatedAt) void qc.invalidateQueries({ queryKey: REF_REWARDS_KEY });
  }, [qc, stats.dataUpdatedAt]);
  const verify = useMutation({
    mutationFn: (taskId: string) => verifyTaskCompletion({ data: { taskId } }),
    onSuccess: (res) => {
      if (res.alreadyDone) {
        toast.info(t("ref.task_already_done"));
      } else {
        toast.success(t("ref.task_done_ticket"));
      }
      qc.invalidateQueries({ queryKey: ["my-tasks"] });
      qc.invalidateQueries({ queryKey: ["my-resources"] });
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const verifyingId = verify.isPending && verify.variables ? verify.variables : null;

  const [copiedKind, setCopiedKind] = useState<"tg" | "web" | null>(null);

  const data = stats.data;
  const tgLink = data?.tgLink ?? null;
  const webLink = data?.webLink ?? data?.link ?? "";

  // copyText — с фолбэком для телеграм-вебвью (там navigator.clipboard нет).
  const copy = (kind: "tg" | "web", url: string) => {
    void copyText(url).then((ok) => {
      if (!ok) return;
      setCopiedKind(kind);
      setTimeout(() => setCopiedKind(null), 1500);
    });
  };

  const queries = [stats, sessionQ, tickets, myTasks, resources];
  if (queries.some((q) => q.isError))
    return (
      <div role="alert" className="space-y-3">
        <p>
          {ru
            ? "Не удалось загрузить рефералов и награды."
            : "Could not load referrals and rewards."}
        </p>
        <button
          className="min-h-11 rounded-xl border px-4"
          onClick={() => {
            for (const q of queries) if (q.isError) void q.refetch();
          }}
        >
          {ru ? "Повторить" : "Retry"}
        </button>
      </div>
    );
  if (queries.some((q) => q.isPending)) return <p role="status">{ru ? "Загрузка…" : "Loading…"}</p>;
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {needsTg && (
        <div className="mx-auto mb-6 max-w-md">
          <TelegramVerify />
        </div>
      )}
      <div className="mb-6">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
          <Users className="h-3.5 w-3.5" />
          {t("ref.program")}
        </div>
        <h1 className="mt-1 font-display text-3xl font-bold">
          {t("ref.invite_friends")}
          <br />
          <span className="text-gradient-gold">{t("ref.earn_tickets")}</span>
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {ru
            ? "Bonus Box за этапы приглашений и 10–20 % золотом с покупок друзей."
            : "A Bonus Box for each invitation milestone and 10–20% in gold of friends' purchases."}
        </p>
      </div>

      <RefGoldCard ru={ru} />

      {/* Золото (бывшие билеты на клейм) */}
      <div className="mb-4 rounded-2xl border border-gold/30 bg-gold/5 p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl gradient-gold shadow-gold">
            <Coins className="h-6 w-6 text-gold-foreground" />
          </div>
          <div className="flex-1">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              {t("ref.claim_tickets")}
            </div>
            <div className="mt-0.5 flex items-baseline gap-2">
              <span className="font-display text-3xl font-bold text-gradient-gold">
                {Math.floor(resources.data?.gold ?? 0).toLocaleString("ru-RU")}
              </span>
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
          {tickets.data?.earnedFromReferrals ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-success">
              <Check className="h-3 w-3" />+{goldForEarnedTickets(tickets.data.earnedFromReferrals)}{" "}
              {t("ref.from_referrals")}
            </span>
          ) : null}
          {tickets.data && "earnedFromTasks" in tickets.data && tickets.data.earnedFromTasks ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-success">
              <Check className="h-3 w-3" />+{goldForEarnedTickets(tickets.data.earnedFromTasks)}{" "}
              {t("ref.from_tasks")}
            </span>
          ) : null}
        </div>
      </div>

      {/* Tasks */}
      {(myTasks.data ?? []).length > 0 && (
        <section className="mb-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <ListChecks className="h-4 w-4 text-gold" />
            {t("ref.tasks")}
            <span className="text-xs text-muted-foreground">{t("ref.plus_one_ticket_each")}</span>
          </div>
          <div className="space-y-2">
            {(myTasks.data ?? []).map((t) => (
              <TaskCard
                key={t.id}
                task={t}
                onVerify={() => verify.mutate(t.id)}
                verifying={verifyingId === t.id}
              />
            ))}
          </div>
        </section>
      )}

      {/* Referral links — две: для TG-бота и для сайта */}
      <div className="space-y-3 rounded-2xl border border-gold/20 bg-card p-4 shadow-card">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          {t("ref.your_links")}
        </div>

        {/* «Поделиться» — главная кнопка (RefShareButton); ссылки ниже копируются. */}
        <RefShareButton tgLink={tgLink} webLink={webLink} />
        {tgLink && (
          <button
            onClick={() => copy("tg", tgLink)}
            className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-gold/40 bg-gold/10 px-4 py-4 text-base font-bold text-gold transition hover:bg-gold/20"
          >
            {copiedKind === "tg" ? (
              <>
                <Check className="h-5 w-5" />
                {t("ref.copied")}
              </>
            ) : (
              <>
                <span className="text-lg">💬</span>
                {t("ref.for_telegram")}
                <Copy className="h-4 w-4 opacity-70" />
              </>
            )}
          </button>
        )}

        {/* Web ссылка — большая кнопка (клик копирует) */}
        <button
          onClick={() => copy("web", webLink)}
          disabled={!webLink}
          className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-gold/40 bg-gold/10 px-4 py-4 text-base font-bold text-gold transition hover:bg-gold/20 disabled:opacity-50"
        >
          {copiedKind === "web" ? (
            <>
              <Check className="h-5 w-5" />
              {t("ref.copied")}
            </>
          ) : (
            <>
              <span className="text-lg">🌐</span>
              {t("ref.browser")}
              <Copy className="h-4 w-4 opacity-70" />
            </>
          )}
        </button>
      </div>

      <ReferralRewards />
      <ReferralDetails data={data} />
    </div>
  );
}
