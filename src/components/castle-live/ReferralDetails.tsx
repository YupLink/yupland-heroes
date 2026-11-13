import { Check, Users, UserCheck, User, ArrowLeft, Search } from "lucide-react";
import { useState } from "react";
import { useT, useLang } from "@/lib/i18n";
import type { getReferralStats } from "@/server/api/user-referrals";

type Stats = Awaited<ReturnType<typeof getReferralStats>>;
export function ReferralDetails({
  data,
  onShowAll,
}: {
  data: Stats | undefined;
  onShowAll: () => void;
}) {
  const ru = useLang() === "ru";
  const totalFriends = data?.totalFriends ?? 0;
  const qualifiedFriends = data?.qualifiedFriends ?? 0;
  const referrals = data?.referrals ?? [];
  // Вехи — тот же счёт, что у выдачи боксов: новые друзья (с 22.10.2026), с 05.11 — прошедшие обучение.
  const tierCount = data?.tierProgress?.count ?? 0;
  const thresholds = data?.tierProgress?.thresholds ?? [];
  const currentTier = thresholds.filter((n) => tierCount >= n).length;
  const nextThreshold = thresholds[currentTier] ?? null;
  const stats = [
    { label: ru ? "Приглашено" : "Invited", value: totalFriends, Icon: Users },
    { label: ru ? "Засчитаны" : "Counted", value: qualifiedFriends, Icon: UserCheck },
    {
      label: ru ? "Ещё нет" : "Not yet",
      value: Math.max(0, totalFriends - qualifiedFriends),
      Icon: User,
    },
  ];
  return (
    <>
      <div className="castle-referrals__stats">
        {stats.map(({ label, value, Icon }) => (
          <div key={label}>
            <Icon aria-hidden="true" />
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      {data?.tierProgress && (
        <section className="castle-referrals__progress">
          <div className="castle-referrals__progress-heading">
            <h3>{ru ? "Этапы приглашений" : "Invitation milestones"}</h3>
            {/* Вехи без конца (каждые 15 после 15-го) — «из скольких» не пишем. */}
            <span>{currentTier}</span>
          </div>
          <p className="castle-referrals__reward">
            {ru ? "Bonus Box за каждый этап" : "A Bonus Box per milestone"}
          </p>
          <div
            className="castle-referrals__milestones"
            role="list"
            aria-label={ru ? "Все этапы приглашений" : "All invitation milestones"}
          >
            {thresholds.map((threshold, i) => {
              const reached = i < currentTier;
              return (
                <div
                  key={threshold}
                  role="listitem"
                  className={`castle-referrals__milestone ${reached ? "is-reached" : threshold === nextThreshold ? "is-next" : ""}`}
                  aria-label={
                    ru
                      ? `Этап ${i + 1}, друзей: ${threshold}${reached ? ", достигнут" : threshold === nextThreshold ? ", следующий" : ""}`
                      : `Milestone ${i + 1}: ${threshold} friends${reached ? ", reached" : threshold === nextThreshold ? ", next" : ""}`
                  }
                >
                  {threshold}
                  {reached && <Check aria-hidden="true" />}
                </div>
              );
            })}
          </div>
          <p className="castle-referrals__next">
            {nextThreshold
              ? ru
                ? `Засчитанных друзей до следующего этапа: ${nextThreshold - tierCount}.`
                : `${nextThreshold - tierCount} more counted ${nextThreshold - tierCount === 1 ? "friend" : "friends"} until the next milestone.`
              : ru
                ? "Все пороги достигнуты"
                : "All thresholds reached"}
          </p>
        </section>
      )}
      <section className="castle-referrals__friends-list">
        <h3>{ru ? "Приглашённые друзья" : "Invited friends"}</h3>
        <FriendRows referrals={referrals.slice(0, 3)} />
        {referrals.length > 3 && (
          <button
            data-game-button="legacy"
            className="castle-referrals__show-all"
            onClick={onShowAll}
          >
            {ru ? `Показать всех · ${totalFriends}` : `View all · ${totalFriends}`}
          </button>
        )}
      </section>
    </>
  );
}

function FriendRows({ referrals }: { referrals: Stats["referrals"] }) {
  const ru = useLang() === "ru";
  const t = useT();
  if (!referrals.length)
    return <p className="castle-referrals__empty">{t("ref.empty_referrals")}</p>;
  return (
    <div className="castle-referrals__list">
      {referrals.map((r) => {
        const raw = r.joinedAt.slice(0, 10);
        const date = /^\d{4}-\d{2}-\d{2}$/.test(raw)
          ? `${raw.slice(8)}.${raw.slice(5, 7)}.${raw.slice(2, 4)}`
          : raw.replace(/\.(\d{2})(\d{2})$/, ".$2");
        return (
          <div key={r.id} className="castle-referrals__friend">
            <p title={r.friend}>{r.friend}</p>
            <time
              dateTime={/^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : undefined}
              aria-label={t("ref.joined_at", { date: r.joinedAt })}
            >
              {date}
            </time>
            <span className={r.qualified ? "is-qualified" : ""}>
              {r.qualified && <Check aria-hidden="true" />}
              {r.qualified ? (ru ? "Засчитан" : "Counted") : ru ? "Ещё нет" : "Not yet"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function ReferralFriendList({
  data,
  onBack,
}: {
  data: Stats | undefined;
  onBack: () => void;
}) {
  const ru = useLang() === "ru";
  const [search, setSearch] = useState("");
  const referrals = data?.referrals ?? [];
  const filtered = referrals.filter((r) =>
    r.friend.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );
  return (
    <section className="castle-referrals__friends-list castle-referrals__all">
      <div className="castle-referrals__all-toolbar">
        <button data-game-button="text" className="castle-referrals__back" onClick={onBack}>
          <ArrowLeft aria-hidden="true" />
          {ru ? "К приглашениям" : "Back to invitations"}
        </button>
        <h3>
          {ru ? "Приглашённые друзья" : "Invited friends"} · {referrals.length}
        </h3>
        <label className="castle-referrals__search">
          <Search aria-hidden="true" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={ru ? "Поиск друга" : "Find a friend"}
            aria-label={ru ? "Поиск друга" : "Find a friend"}
            type="search"
          />
        </label>
      </div>
      {filtered.length ? (
        <FriendRows referrals={filtered} />
      ) : (
        <p className="castle-referrals__empty" role="status">
          {ru ? "Друзья не найдены" : "No friends found"}
        </p>
      )}
    </section>
  );
}
