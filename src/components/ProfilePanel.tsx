import { useEffect, useState } from "react";
import { SolanaConnect } from "./SolanaConnect";
import { useQuery } from "@tanstack/react-query";
import { useAppStore } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { getMyReputation } from "@/server/api/user-sisters";
import {
  getMySubscription,
  getMyYuplandAchievements,
  getYuplandProfile,
  getYuplandStatus,
} from "@/server/api/user-shop";
import {
  Trophy,
  Zap,
  Skull,
  Star,
  Award,
  Lock,
  X,
  ChevronDown,
  ChevronUp,
  Crown,
} from "lucide-react";

/**
 * Палитра по уровню подписки — даёт визуальную разницу между T1/T2/T3.
 * T1 — бронза/тёплая, T2 — серебро/холодная, T3 — gold/iridescent.
 * Используется и в chip, и в panel, и в магазине.
 */
export function subscriptionPalette(level: number | null | undefined): {
  chipText: string;
  chipBg: string;
  chipBorder: string;
  iconColor: string;
  bg: string;
  border: string;
  badge: string;
  tierLabel: string;
} {
  if (level === 1) {
    return {
      chipText: "text-orange-300",
      chipBg: "bg-orange-500/15",
      chipBorder: "border-orange-400/30",
      iconColor: "text-orange-300",
      bg: "bg-gradient-to-r from-orange-500/10 to-amber-400/5",
      border: "border-orange-400/30",
      badge: "from-orange-500/20 to-amber-400/20",
      tierLabel: "T1",
    };
  }
  if (level === 2) {
    return {
      chipText: "text-slate-200",
      chipBg: "bg-slate-300/15",
      chipBorder: "border-slate-300/40",
      iconColor: "text-slate-200",
      bg: "bg-gradient-to-r from-slate-300/10 to-zinc-400/5",
      border: "border-slate-300/40",
      badge: "from-slate-300/25 to-zinc-200/15",
      tierLabel: "T2",
    };
  }
  // T3+ (premium gold с лёгким fuchsia акцентом для отличия от обычного gold)
  return {
    chipText: "text-amber-300",
    chipBg:
      "bg-gradient-to-r from-amber-500/20 via-yellow-400/20 to-fuchsia-400/15",
    chipBorder: "border-amber-300/50",
    iconColor: "text-amber-300",
    bg:
      "bg-gradient-to-r from-amber-500/15 via-yellow-400/10 to-fuchsia-400/10",
    border: "border-amber-300/50",
    badge:
      "from-amber-500/25 via-yellow-400/20 to-fuchsia-400/20",
    tierLabel: `T${level ?? 3}`,
  };
}

/** Сокращённое число: 60 тыс / 41 млн / 1.2 млрд. */
export function shortNumber(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 1_000_000_000)
    return `${(n / 1_000_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} млрд`;
  if (n >= 1_000_000)
    return `${(n / 1_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} млн`;
  if (n >= 10_000)
    return `${(n / 1_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} тыс`;
  return n.toLocaleString("ru-RU");
}

/**
 * Компактная плашка на главной: "Lv.15 · 59 916⚡" → клик открывает
 * полноразмерную панель со всеми деталями (XP-bar, ачивки, репутация).
 *
 * Хуки тут же — данные загружаются для чипса (уровень/энергия) и
 * переиспользуются в открытой панели (один QueryClient cache).
 */
export function ProfileChip() {
  const t = useT();
  const { walletConnected } = useAppStore();
  const [open, setOpen] = useState(false);

  const yupland = useQuery({
    queryKey: ["yupland-status", walletConnected],
    queryFn: () => getYuplandStatus(),
    enabled: walletConnected,
    staleTime: 60_000,
  });
  const ylProfile = useQuery({
    queryKey: ["yupland-profile", walletConnected],
    queryFn: () => getYuplandProfile(),
    enabled: walletConnected,
    staleTime: 60_000,
  });
  const sub = useQuery({
    queryKey: ["my-subscription", walletConnected],
    queryFn: () => getMySubscription(),
    enabled: walletConnected,
    staleTime: 60_000,
  });

  if (!walletConnected) return null;

  const energy =
    yupland.data && "energyBalance" in yupland.data
      ? yupland.data.energyBalance
      : null;
  const lvl = ylProfile.data?.level ?? null;
  const subscription = sub.data;
  const hasAnything = lvl != null || energy != null || !!subscription;
  if (!hasAnything) return null;

  const palette = subscription
    ? subscriptionPalette(subscription.level)
    : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition",
          palette
            ? `${palette.chipBorder} ${palette.chipBg} hover:brightness-110`
            : "border-gold/30 bg-gold/5 hover:bg-gold/10"
        )}
      >
        {subscription && palette && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full bg-gradient-to-r px-1.5 py-0.5 text-[10px] font-bold",
              palette.badge,
              palette.chipText
            )}
            title={t("profile.subscription_title", {
              name: subscription.title ?? subscription.slug ?? "",
              pct: subscription.discountPct,
            })}
          >
            <Crown className="h-2.5 w-2.5" />
            {palette.tierLabel}
          </span>
        )}
        {lvl != null && (
          <span className="inline-flex items-center gap-1">
            <Star className="h-3 w-3 text-gold" />
            <span className="text-gradient-gold font-bold">Lv.{lvl}</span>
          </span>
        )}
        {lvl != null && energy != null && (
          <span className="text-muted-foreground">·</span>
        )}
        {energy != null && (
          <span className="inline-flex items-center gap-1 text-neon">
            <Zap className="h-3 w-3" />
            <span className="font-mono text-[11px]">{shortNumber(energy)}</span>
          </span>
        )}
      </button>
      <ProfilePanel open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function ProfilePanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const { walletConnected } = useAppStore();
  const yupland = useQuery({
    queryKey: ["yupland-status", walletConnected],
    queryFn: () => getYuplandStatus(),
    enabled: open && walletConnected,
    staleTime: 60_000,
  });
  const ylProfile = useQuery({
    queryKey: ["yupland-profile", walletConnected],
    queryFn: () => getYuplandProfile(),
    enabled: open && walletConnected,
    staleTime: 60_000,
  });
  const ylAch = useQuery({
    queryKey: ["yupland-achievements", walletConnected],
    queryFn: () => getMyYuplandAchievements(),
    enabled: open && walletConnected,
    staleTime: 5 * 60_000,
  });
  const rep = useQuery({
    queryKey: ["my-reputation", walletConnected],
    queryFn: () => getMyReputation(),
    enabled: open && walletConnected,
    staleTime: 5 * 60_000,
  });
  const sub = useQuery({
    queryKey: ["my-subscription", walletConnected],
    queryFn: () => getMySubscription(),
    enabled: open && walletConnected,
    staleTime: 60_000,
  });
  const [achOpen, setAchOpen] = useState(false);

  // Esc to close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const energy =
    yupland.data && "energyBalance" in yupland.data
      ? yupland.data.energyBalance
      : null;
  const yuplandLinked = yupland.data?.linked === true;

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-3xl border-t border-gold/20 bg-card pb-[calc(16px+env(safe-area-inset-bottom))]">
        <div className="sticky top-0 flex items-center justify-between border-b border-border/50 bg-card px-4 py-3">
          <div className="text-sm font-display font-bold">{t("profile.title")}</div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary text-muted-foreground transition hover:bg-destructive/15 hover:text-destructive"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="space-y-2 px-4 pt-3">
          <SolanaConnect />
          {/* Подписка Yupland — цвет зависит от уровня (T1=бронза, T2=серебро, T3=gold+iridescent) */}
          {sub.data && (
            (() => {
              const p = subscriptionPalette(sub.data.level);
              return (
                <div
                  className={cn(
                    "flex items-center gap-2 rounded-xl border px-3 py-2",
                    p.border,
                    p.bg
                  )}
                >
                  <div
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br",
                      p.badge,
                      p.iconColor
                    )}
                  >
                    <Crown className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[9px] uppercase tracking-widest text-muted-foreground">
                      {t("profile.subscription_label")}{" "}
                      {sub.data.title ? `· ${sub.data.title}` : ""}
                    </div>
                    <div className="flex items-baseline gap-2 leading-tight">
                      <span
                        className={cn(
                          "font-display text-sm font-bold",
                          p.chipText
                        )}
                      >
                        {p.tierLabel}
                      </span>
                      <span className="text-[10px] text-success">
                        {t("profile.discount_on_tickets", {
                          pct: sub.data.discountPct,
                        })}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[10px] text-muted-foreground">
                      {t("profile.until")}{" "}
                      {new Date(sub.data.expiresAt).toLocaleDateString("ru-RU", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </div>
                  </div>
                </div>
              );
            })()
          )}

          {/* Энергия */}
          {yuplandLinked && (
            <div className="flex items-center gap-2 rounded-xl border border-neon/30 bg-neon/5 px-3 py-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-neon/15 text-neon">
                <Zap className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[9px] uppercase tracking-widest text-muted-foreground">
                  {t("profile.energy_label")}
                </div>
                <div className="font-display text-sm font-bold leading-tight text-neon">
                  {energy != null ? energy.toLocaleString("ru-RU") : "—"}{" "}
                  <span className="text-[10px] text-muted-foreground">⚡</span>
                </div>
              </div>
            </div>
          )}

          {/* Уровень + ачивки */}
          {ylProfile.data && (
            <div className="overflow-hidden rounded-xl border border-gold/25 bg-gold/5">
              <div className="flex items-center gap-2 px-3 py-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gold/15 text-gold">
                  <Star className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[9px] uppercase tracking-widest text-muted-foreground">
                    {t("profile.level_label")}{" "}
                    {ylProfile.data.levelTitle &&
                      `· ${ylProfile.data.levelTitle}`}
                  </div>
                  <div className="flex items-baseline gap-1 leading-tight">
                    <span className="font-display text-sm font-bold text-gradient-gold">
                      Lv. {ylProfile.data.level}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {ylProfile.data.xp.toLocaleString("ru-RU")}
                      {ylProfile.data.nextLevelXp > 0 &&
                        ` / ${ylProfile.data.nextLevelXp.toLocaleString("ru-RU")} XP`}
                    </span>
                  </div>
                </div>
                {ylAch.data && ylAch.data.total > 0 && (
                  <button
                    onClick={() => setAchOpen((v) => !v)}
                    className="flex shrink-0 items-center gap-1 rounded-lg border border-border bg-card px-2 py-1 text-[10px] font-medium hover:border-gold/40"
                  >
                    <Award className="h-3 w-3 text-gold" />
                    <span>
                      {ylAch.data.earned.length}/{ylAch.data.total}
                    </span>
                    {achOpen ? (
                      <ChevronUp className="h-3 w-3" />
                    ) : (
                      <ChevronDown className="h-3 w-3" />
                    )}
                  </button>
                )}
              </div>
              {ylProfile.data.nextLevelXp > 0 && (
                <div className="h-1 bg-border/40">
                  <div
                    className="h-full bg-gradient-to-r from-gold/70 to-gold"
                    style={{ width: `${ylProfile.data.progressPct}%` }}
                  />
                </div>
              )}
              {achOpen && ylAch.data && (
                <div className="border-t border-gold/15 px-3 py-2">
                  {ylAch.data.earned.length > 0 && (
                    <>
                      <div className="mb-1 text-[9px] uppercase tracking-widest text-muted-foreground">
                        {t("profile.achievements_earned")}
                      </div>
                      <div className="mb-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                        {ylAch.data.earned.slice(0, 60).map((a) => (
                          <div
                            key={a.id}
                            className="flex items-center gap-1.5 rounded-lg border border-gold/25 bg-gold/5 px-2 py-1"
                            title={a.description ?? ""}
                          >
                            {a.icon ? (
                              <img
                                src={a.icon}
                                alt=""
                                className="h-4 w-4 shrink-0 rounded"
                              />
                            ) : (
                              <Trophy className="h-3 w-3 shrink-0 text-gold" />
                            )}
                            <span className="truncate text-[10px]">
                              {a.name}
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                  {ylAch.data.locked.length > 0 && (
                    <>
                      <div className="mb-1 text-[9px] uppercase tracking-widest text-muted-foreground">
                        {t("profile.achievements_locked")}
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                        {ylAch.data.locked.slice(0, 60).map((a) => (
                          <div
                            key={a.id}
                            className="flex items-center gap-1.5 rounded-lg border border-border bg-card/50 px-2 py-1 opacity-60"
                            title={a.description ?? ""}
                          >
                            <Lock className="h-3 w-3 shrink-0 text-muted-foreground" />
                            <span className="truncate text-[10px] text-muted-foreground">
                              {a.name}
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Репутация Sendler */}
          {(rep.data?.rows.length ?? 0) > 0 && (
            <div className="space-y-1.5 pt-2">
              <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-widest text-muted-foreground">
                <Trophy className="h-2.5 w-2.5 text-gold" />
                {t("profile.reputation_sendler")}
              </div>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {rep
                  .data!.rows.slice()
                  .sort((a, b) => {
                    if (a.rank != null && b.rank != null) return a.rank - b.rank;
                    if (a.rank != null) return -1;
                    if (b.rank != null) return 1;
                    return (a.negativeRank ?? 0) - (b.negativeRank ?? 0);
                  })
                  .map((r) => {
                    const isNegative = r.totalReputation < 0;
                    return (
                      <div
                        key={r.wallet}
                        className={cn(
                          "flex items-center gap-2 rounded-xl border bg-card px-2.5 py-2 transition",
                          isNegative
                            ? "border-destructive/30 hover:border-destructive/50"
                            : "border-gold/20 hover:border-gold/40"
                        )}
                      >
                        <div
                          className={cn(
                            "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                            isNegative
                              ? "bg-destructive/10 text-destructive"
                              : "bg-gold/10 text-gold"
                          )}
                        >
                          {isNegative ? (
                            <Skull className="h-3.5 w-3.5" />
                          ) : (
                            <Trophy className="h-3.5 w-3.5" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-mono text-[10px] text-foreground">
                            {r.wallet}
                          </div>
                          <div className="flex items-baseline gap-1">
                            <span
                              className={cn(
                                "font-display text-xs font-bold leading-tight",
                                isNegative
                                  ? "text-destructive"
                                  : "text-gradient-gold"
                              )}
                            >
                              {r.totalReputation.toLocaleString("ru-RU")}
                            </span>
                            <span className="text-[9px] text-muted-foreground">
                              {isNegative
                                ? t("profile.rep_units_anti")
                                : t("profile.rep_units")}
                            </span>
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          {isNegative && r.negativeRank != null ? (
                            <>
                              <div className="font-display text-xs font-bold text-destructive">
                                #{r.negativeRank}
                              </div>
                              {(rep.data as { negativeTotal?: number })
                                .negativeTotal != null &&
                                ((rep.data as { negativeTotal?: number })
                                  .negativeTotal ?? 0) > 0 && (
                                  <div className="text-[9px] text-muted-foreground">
                                    {t("profile.out_of")}{" "}
                                    {
                                      (rep.data as { negativeTotal?: number })
                                        .negativeTotal
                                    }
                                  </div>
                                )}
                            </>
                          ) : r.rank != null ? (
                            <>
                              <div className="font-display text-xs font-bold text-gold">
                                #{r.rank}
                              </div>
                              {rep.data!.total > 0 && (
                                <div className="text-[9px] text-muted-foreground">
                                  {t("profile.out_of")}{" "}
                                  {rep.data!.total.toLocaleString("ru-RU")}
                                </div>
                              )}
                            </>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
