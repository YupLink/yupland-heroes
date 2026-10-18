// Окно «Профиль» внутрянки замка: аккаунт и рефералы одной кнопкой в шапке.
// Кружок-аватар — в CastleProfileButton.tsx (грузится статически).
import { useQuery } from "@tanstack/react-query";
import { getSession } from "@/server/api/user-auth";
import { getMySelectedHero } from "@/server/api/heroes-select";
import { thumb } from "@/lib/image";
import { useEffect, useRef, useState } from "react";
import { useLang } from "@/lib/i18n";
import { ProfileTreasuryEntry } from "./ProfileTreasuryEntry";
import { CastleAccount } from "./CastleAccount";
import "./castle-profile.css";
import { CastleReferrals } from "./CastleReferrals";
import { CastleAchievements } from "./CastleAchievements";
import trophyImage from "@/assets/harvest/trophy.webp";
import yupikPackImage from "@/assets/quests/yupik-pack.webp";
export type PlayerLevelProgress = { level: number | null; progressPct: number | null };

export function CastleProfile({
  onSignedOut,
  onEdit,
  walletStatus,
  onPreviewWalletChange,
  playerLevel,
  onTreasury,
  onOpenPacks,
  focusPacksOnMount = false,
}: {
  onTreasury?: () => void; // Казна живёт в профиле — постройки Казны нет
  onOpenPacks?: () => void;
  focusPacksOnMount?: boolean;
  onSignedOut?: () => void;
  onEdit?: () => void;
  walletStatus?: "connected" | "disconnected";
  onPreviewWalletChange?: (connected: boolean) => void;
  playerLevel?: PlayerLevelProgress;
}) {
  const ru = useLang() === "ru";
  const session = useQuery({ queryKey: ["session"], queryFn: () => getSession() });
  const hero = useQuery({ queryKey: ["my-selected-hero"], queryFn: () => getMySelectedHero() });
  // Награды портала — теперь «Ачивки» игры: старые перенесены в аккаунт (§8.57).
  const [rewardsOpen, setRewardsOpen] = useState(false);
  const [tab, setTab] = useState<"account" | "referrals">("account");
  const [fullReferralList, setFullReferralList] = useState(false);
  const packsButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!focusPacksOnMount) return;
    const frame = requestAnimationFrame(() => packsButton.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [focusPacksOnMount]);
  return (
    <div className="castle-profile">
      {rewardsOpen ? (
        <CastleAchievements onBack={() => setRewardsOpen(false)} />
      ) : (
        <>
          {!fullReferralList && (
            <>
              <section className="castle-profile__identity">
                <div className="castle-profile__identity-top">
                  {onOpenPacks && (
                    <button ref={packsButton} type="button" className="castle-profile__packs-button" onClick={onOpenPacks}>
                      <span><img src={yupikPackImage} alt="" /></span>
                      {ru ? "Паки" : "Packs"}
                    </button>
                  )}
                  <span className="castle-profile__avatar" aria-hidden="true">
                    {hero.data?.imageUrl ? (
                      <img src={thumb(hero.data.imageUrl, 192)} alt="" />
                    ) : (
                      "Я"
                    )}
                  </span>
                  <button
                    type="button"
                    className="castle-profile__rewards-button"
                    onClick={() => setRewardsOpen(true)}
                  >
                    <span>
                      <img src={trophyImage} alt="" />
                    </span>
                    {ru ? "Ачивки" : "Achievements"}
                  </button>
                </div>
                <h2>{ru ? "Игрок" : "Player"}</h2>
                <p className="text-muted-foreground">
                  {session.data?.telegramUsername
                    ? `@${session.data.telegramUsername}`
                    : session.isPending
                      ? ru
                        ? "Загрузка…"
                        : "Loading…"
                      : session.isError
                        ? ru
                          ? "Не удалось проверить аккаунт"
                          : "Could not verify account"
                        : ru
                          ? "Игровой аккаунт"
                          : "Game account"}
                </p>
                {hero.isError && (
                  <p className="castle-profile__hero-error" role="alert">
                    {ru
                      ? "Не удалось проверить выбранного героя."
                      : "Could not verify the selected hero."}{" "}
                    <button type="button" onClick={() => void hero.refetch()}>
                      {ru ? "Повторить" : "Retry"}
                    </button>
                  </p>
                )}
                <div className="castle-profile__level">
                  <span className="castle-profile__level-badge">
                    <strong>{playerLevel?.level ?? "—"}</strong>
                  </span>
                  <div className="castle-profile__level-detail">
                    <span>{ru ? "Уровень игрока" : "Player level"}</span>
                    <div
                      className="castle-profile__level-track"
                      role="progressbar"
                      aria-label={ru ? "Прогресс игрового уровня" : "Player level progress"}
                      aria-valuemin={playerLevel?.progressPct == null ? undefined : 0}
                      aria-valuemax={playerLevel?.progressPct == null ? undefined : 100}
                      aria-valuenow={
                        playerLevel?.progressPct == null
                          ? undefined
                          : Math.min(100, Math.max(0, playerLevel.progressPct))
                      }
                    >
                      <span
                        style={{
                          width: `${Math.min(100, Math.max(0, playerLevel?.progressPct ?? 0))}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </section>
              {onTreasury && <ProfileTreasuryEntry ru={ru} onOpen={onTreasury} />}
              <div
                className="castle-profile__tabs flex"
                role="group"
                aria-label={ru ? "Разделы профиля" : "Profile sections"}
              >
                {(["account", "referrals"] as const).map((id) => (
                  <button
                    data-game-button="tab"
                    key={id}
                    id={`profile-${id}`}
                    aria-pressed={tab === id}
                    aria-controls="profile-panel"
                    className={`min-h-11 flex-1 rounded-xl border px-3 ${tab === id ? "border-gold bg-gold/10" : "border-border"}`}
                    onClick={() => setTab(id)}
                  >
                    {id === "account" ? (ru ? "Настройки" : "Settings") : ru ? "Друзья" : "Friends"}
                  </button>
                ))}
              </div>
            </>
          )}
          <div
            id="profile-panel"
            role="region"
            aria-labelledby={fullReferralList ? undefined : `profile-${tab}`}
            aria-label={
              fullReferralList ? (ru ? "Приглашённые друзья" : "Invited friends") : undefined
            }
          >
            {tab === "account" ? (
              <CastleAccount
                walletStatus={walletStatus}
                onPreviewWalletChange={onPreviewWalletChange}
                onSignedOut={onSignedOut}
                onEdit={onEdit}
              />
            ) : (
              <CastleReferrals onListChange={setFullReferralList} />
            )}
          </div>
        </>
      )}
    </div>
  );
}
