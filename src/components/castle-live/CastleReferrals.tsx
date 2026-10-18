import { copyText } from "@/lib/copyText";
import { useState, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSession } from "@/server/api/user-auth";
import { getMyTickets } from "@/server/api/user-tickets";
import { getReferralStats } from "@/server/api/user-referrals";
import { TelegramVerify } from "@/components/TelegramVerify";
import { Copy, Check } from "lucide-react";
import { ResourceGlyph } from "@/components/ui/ResourceGlyph";
import { useT, useLang } from "@/lib/i18n";
import { ReferralDetails, ReferralFriendList } from "./ReferralDetails";

export function CastleReferrals({ onListChange }: { onListChange?: (all: boolean) => void }) {
  const t = useT();
  const qc = useQueryClient();
  const [showAll, setShowAll] = useState(false);
  const view = useRef<HTMLDivElement>(null);
  const switchList = (all: boolean) => {
    setShowAll(all);
    onListChange?.(all);
    requestAnimationFrame(() => {
      view.current?.focus({ preventScroll: true });
      view.current?.scrollIntoView({ block: "start" });
    });
  };
  const ru = useLang() === "ru";
  const stats = useQuery({
    queryKey: ["referral-stats"],
    queryFn: () => getReferralStats(),
  });
  useEffect(() => {
    if (stats.dataUpdatedAt) void qc.invalidateQueries({ queryKey: ["my-tickets"], exact: true });
  }, [qc, stats.dataUpdatedAt]);
  // Без TG смотреть можно, действия закрыты сервером — показываем баннер.
  const sessionQ = useQuery({
    queryKey: ["session"],
    queryFn: () => getSession(),
  });
  const needsTg = !!sessionQ.data?.wallet && !sessionQ.data.telegramLinked;

  const tickets = useQuery({
    // Referral stats may settle a newly reached ticket tier on the server.
    // Read the balance only after that request, including after a stats refetch.
    queryKey: ["my-tickets", "referral-stats", stats.dataUpdatedAt],
    queryFn: () => getMyTickets(),
    enabled: stats.isSuccess,
  });

  const [copiedKind, setCopiedKind] = useState<"tg" | "web" | null>(null);

  const [failedUrl, setFailedUrl] = useState("");
  const data = stats.data;
  const tgLink = data?.tgLink ?? null;
  const webLink = data?.webLink ?? data?.link ?? "";

  // copyText — с фолбэком для телеграм-вебвью (там navigator.clipboard нет).
  const copy = (kind: "tg" | "web", url: string) => {
    void copyText(url).then((ok) => {
      setFailedUrl(ok ? "" : url);
      if (!ok) return;
      setCopiedKind(kind);
      setTimeout(() => setCopiedKind(null), 1500);
    });
  };

  const queries = [stats, sessionQ];
  if (queries.some((q) => q.isError))
    return (
      <div role="alert" className="space-y-3">
        <p>
          {ru
            ? "Не удалось загрузить рефералов и награды."
            : "Could not load referrals and rewards."}
        </p>
        <button
          data-game-button="secondary"
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
    <div
      ref={view}
      tabIndex={-1}
      role="region"
      aria-label={
        showAll
          ? ru
            ? "Все приглашённые друзья"
            : "All invited friends"
          : ru
            ? "Приглашения"
            : "Invitations"
      }
      className="castle-profile__friends mx-auto max-w-3xl"
    >
      {needsTg && (
        <div className="mx-auto mb-6 max-w-md">
          <TelegramVerify context="profile" />
        </div>
      )}
      {showAll ? (
        <ReferralFriendList data={data} onBack={() => switchList(false)} />
      ) : (
        <>
          <section className="castle-referrals__invite">
            <h2>{ru ? "Приглашай друзей" : "Invite friends"}</h2>
            <p>
              {ru
                ? "Билеты за этапы приглашений. Друг засчитывается после покупки пака с фишками."
                : "Tickets for invitation milestones. A friend counts after purchasing a chip pack."}
            </p>
            <button
              data-game-button="primary"
              onClick={() => copy(tgLink ? "tg" : "web", tgLink || webLink)}
              disabled={!tgLink && !webLink}
              className="castle-profile__connect castle-referrals__copy"
            >
              {copiedKind === (tgLink ? "tg" : "web") ? (
                <Check aria-hidden="true" />
              ) : (
                <Copy aria-hidden="true" />
              )}
              {copiedKind === (tgLink ? "tg" : "web")
                ? t("ref.copied")
                : ru
                  ? "Скопировать ссылку"
                  : "Copy invite link"}
            </button>
            {tgLink && webLink && (
              <button
                data-game-button="text"
                className="castle-referrals__web"
                onClick={() => copy("web", webLink)}
              >
                {copiedKind === "web"
                  ? t("ref.copied")
                  : ru
                    ? "Ссылка для сайта"
                    : "Website invite link"}
              </button>
            )}
            {failedUrl && (
              <div className="castle-referrals__copy-fallback">
                <p role="alert">
                  {ru ? "Выдели и скопируй ссылку вручную." : "Select and copy the link manually."}
                </p>
                <input
                  readOnly
                  value={failedUrl}
                  aria-label={ru ? "Ссылка приглашения" : "Invite link"}
                  onFocus={(event) => event.currentTarget.select()}
                />
              </div>
            )}
          </section>
          <ReferralDetails data={data} onShowAll={() => switchList(true)} />
          <div className="castle-referrals__balance">
            <ResourceGlyph kind="tickets" className="h-6 w-6" />
            <span>{ru ? "Твои билеты" : "Your tickets"}</span>
            {tickets.isError ? (
              <button data-game-button="text" onClick={() => void tickets.refetch()}>
                {ru ? "Повторить загрузку" : "Retry loading"}
              </button>
            ) : (
              <strong>
                {stats.isFetching || tickets.isFetching || tickets.isPending
                  ? "…"
                  : (tickets.data?.available ?? 0)}
              </strong>
            )}
          </div>
        </>
      )}
    </div>
  );
}
