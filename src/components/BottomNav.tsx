import { Link, useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  Home,
  Package,
  Users,
  ShieldCheck,
  Search,
  MoreHorizontal,
  X,
  Layers,
  Wallet,
  Sparkles,
  Hammer,
  Gavel,
  Dices,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getSession } from "@/server/api/user-auth";
import { useT } from "@/lib/i18n";
import type { LucideIcon } from "lucide-react";

type NavTo =
  | "/"
  | "/home"
  | "/my-nfts"
  | "/referrals"
  | "/lookup"
  | "/admin"
  | "/admin/wallet"
  | "/admin/chips"
  | "/wallet"
  | "/chips"
  | "/hallway"
  | "/slot";

type NavItem = {
  to: NavTo;
  labelKey: string;
  icon: LucideIcon;
  exact?: boolean;
};

// Внешние сервисы (открываются в новой вкладке).
type ExternalItem = {
  href: string;
  labelKey: string;
  icon: LucideIcon;
  adminOnly?: boolean;
};

const externalItems: ExternalItem[] = [
  {
    // Сервис «Минт NFT» (внутренний admin-роут golden-drop /admin/mint,
    // как @nft_sender_yupland_bot). Локальный путь → та же вкладка.
    href: "/admin/mint",
    labelKey: "nav.mint",
    icon: Hammer,
    adminOnly: true,
  },
  {
    // Сервис «Аукцион» (внутренний admin-роут /admin/auction) — массовое
    // выставление NFT на продажу на sendler-market.near.
    href: "/admin/auction",
    labelKey: "nav.auction",
    icon: Gavel,
    adminOnly: true,
  },
  {
    // Перенос с Vercel на свой сервер (service.yupland.io/combo, basePath).
    href: "/combo",
    labelKey: "nav.combo_duplo",
    icon: Layers,
    adminOnly: true,
  },
];

const primaryItems: NavItem[] = [
  { to: "/home", labelKey: "nav.home", icon: Home, exact: true }, // главная сервиса ('/' = кош)
  { to: "/my-nfts", labelKey: "nav.my_nfts", icon: Package },
  { to: "/referrals", labelKey: "nav.referrals", icon: Users },
];

const moreItems: NavItem[] = [
  { to: "/lookup", labelKey: "nav.search", icon: Search },
];

export function BottomNav() {
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const t = useT();
  const { data: session } = useQuery({
    queryKey: ["session"],
    queryFn: () => getSession(),
  });

  // Wallet — теперь публичный (/wallet, MyWalletSection без admin-вью).
  // Для админов — отдельный пункт /admin/wallet с полным аудит-view.
  // /chips — публичный.
  const more: NavItem[] = session?.isAdmin
    ? [
        ...moreItems,
        { to: "/hallway", labelKey: "nav.hallway", icon: Sparkles },
        { to: "/slot", labelKey: "nav.slot", icon: Dices }, // прототип слота (пока только админам)
        { to: "/wallet", labelKey: "nav.yuplink_wallet", icon: Wallet },
        { to: "/admin", labelKey: "nav.admin", icon: ShieldCheck },
      ]
    : [
        ...moreItems,
        { to: "/wallet", labelKey: "nav.yuplink_wallet", icon: Wallet },
      ];

  // Подсветить More если активный путь — один из more-пунктов.
  const moreActive = more.some((m) => location.pathname.startsWith(m.to));

  // Закрывать popup при смене пути.
  useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname]);

  // Esc закрывает popup.
  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMoreOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moreOpen]);

  return (
    <>
      {/* Popup-меню (анимация снизу), как у Sendler. */}
      {moreOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={() => setMoreOpen(false)}
          />
          <div
            className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-50 mx-auto max-w-md animate-float-up rounded-t-2xl border border-border/70 bg-card/95 px-2 py-2 shadow-card backdrop-blur-xl"
            role="menu"
          >
            <div className="flex items-center justify-between px-3 py-2 text-[11px] uppercase tracking-widest text-muted-foreground">
              <span>{t("more.title")}</span>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="rounded-full p-1 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                aria-label="Закрыть"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-0.5">
              {more.map((m) => {
                const Icon = m.icon;
                const active = m.exact
                  ? location.pathname === m.to
                  : location.pathname.startsWith(m.to);
                return (
                  <Link
                    key={m.to}
                    to={m.to}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition",
                      active
                        ? "bg-gold/10 text-gold"
                        : "text-foreground hover:bg-secondary/60"
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-5 w-5",
                        active ? "text-gold" : "text-muted-foreground"
                      )}
                    />
                    <span className="font-medium">{t(m.labelKey)}</span>
                  </Link>
                );
              })}
              {/* Внешние сервисы (открываются в новой вкладке) */}
              {externalItems
                .filter((x) => !x.adminOnly || session?.isAdmin)
                .map((x) => {
                  const Icon = x.icon;
                  // Локальные пути (/...) — открываем в той же вкладке.
                  // Внешние URL — в новой.
                  const isLocal = x.href.startsWith("/");
                  return (
                    <a
                      key={x.href}
                      href={x.href}
                      {...(isLocal
                        ? {}
                        : { target: "_blank", rel: "noopener noreferrer" })}
                      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-foreground transition hover:bg-secondary/60"
                    >
                      <Icon className="h-5 w-5 text-muted-foreground" />
                      <span className="font-medium">{t(x.labelKey)}</span>
                      {x.adminOnly && (
                        <span className="ml-auto inline-flex items-center gap-0.5 rounded-full border border-neon/30 bg-neon/10 px-1.5 py-0.5 text-[9px] font-medium text-neon">
                          admin
                        </span>
                      )}
                    </a>
                  );
                })}
            </div>
          </div>
        </>
      )}

      <nav
        // fixed чтобы НАВ-бар всегда был внизу viewport'а, а не «прилипал»
        // к концу скролла. pb safe-area для iOS.
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border/50 bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl"
      >
        <div className="mx-auto grid max-w-6xl grid-cols-4">
          {primaryItems.map((item) => {
            const Icon = item.icon;
            const active = item.exact
              ? location.pathname === item.to
              : location.pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-[11px] transition",
                  active
                    ? "text-gold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon
                  className={cn(
                    "h-5 w-5 transition",
                    active && "drop-shadow-[0_0_8px_var(--color-gold)]"
                  )}
                />
                <span className="font-medium">{t(item.labelKey)}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            className={cn(
              "flex flex-col items-center gap-1 py-2.5 text-[11px] transition",
              moreActive || moreOpen
                ? "text-gold"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <MoreHorizontal
              className={cn(
                "h-5 w-5 transition",
                (moreActive || moreOpen) &&
                  "drop-shadow-[0_0_8px_var(--color-gold)]"
              )}
            />
            <span className="font-medium">{t("nav.more")}</span>
          </button>
        </div>
      </nav>
    </>
  );
}
