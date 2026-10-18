// YupLink Wallet — публичный роут для всех залогиненных юзеров.
// Рендерит только MyWalletSection (мой кошелёк + создание/импорт/PIN).
// Админ-аудит всех юзерских кошельков остаётся на /admin/wallet.

import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { TelegramLoginModal } from "@/components/auth/TelegramLoginModal";
import { MyWalletSection } from "@/routes/admin.wallet";
import { listLocalWallets } from "@/lib/embeddedWallet";
import { InstallAppBanner } from "@/components/Pwa";
import { AccountSection } from "@/components/account/AccountSection";
import { getSession } from "@/server/api/user-auth";
import { useAppStore } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { useEffect, useRef, useState } from "react";
import { Shield, Wallet as WalletIcon, ArrowLeft, Sparkles, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/wallet")({
  head: () => ({
    meta: [
      { title: "Кошелёк — YupLink" },
      { name: "description", content: "Создай или импортируй NEAR-кошелёк прямо в приложении" },
    ],
  }),
  component: WalletPage,
});

function WalletPage() {
  // ВАЖНО: wallet.tsx — родитель в файловой роутинге для wallet.connect /
  // wallet.docs / wallet.sign / wallet.sign-message. Без <Outlet/> дочерние
  // страницы при SPA-навигации не монтируются — URL меняется, но рендерится
  // родительский дашборд. Делаем явный switch: если path — child-роут, отдаём
  // только <Outlet/> (дочерние страницы оборачивают себя сами в AppShell).
  // Все хуки ниже всё равно вызываются — порядок стабилен между рендерами.
  const t = useT();
  const location = useLocation();
  const isChildRoute = location.pathname !== "/wallet";

  const walletConnected = useAppStore((s) => s.walletConnected);
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const { data: session } = useQuery({
    queryKey: ["session"],
    queryFn: () => getSession(),
  });

  // ?return=/wallet/connect?... — пришли сюда из dApp-flow для создания
  // кошелька. Покажем баннер «вернуться к подключению» и автоматом вернём
  // после того, как появится хотя бы один embedded-кошелёк.
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const startedWith = useRef<number | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const r = new URLSearchParams(window.location.search).get("return");
    if (r && r.startsWith("/")) setReturnTo(r);
    // Запоминаем сколько кошельков было при заходе — чтобы понять, появился ли НОВЫЙ.
    (async () => {
      try {
        startedWith.current = (await listLocalWallets()).length;
      } catch {
        startedWith.current = 0;
      }
    })();
  }, []);
  // Поллим список локальных кошельков — если число выросло, авто-возврат в dApp.
  useEffect(() => {
    if (!returnTo) return;
    const id = setInterval(async () => {
      try {
        const n = (await listLocalWallets()).length;
        if (startedWith.current !== null && n > startedWith.current) {
          window.location.href = returnTo;
        }
      } catch {
        /* ignore */
      }
    }, 1500);
    return () => clearInterval(id);
  }, [returnTo]);

  // Все хуки выше уже вызваны — теперь можно безопасно делать early-return.
  // Для child-роутов (wallet.connect / wallet.docs / wallet.sign / wallet.sign-message)
  // отдаём только <Outlet/>, чтобы дочерняя страница рендерилась вместо дашборда.
  // Дочерние страницы оборачивают себя в AppShell сами.
  if (isChildRoute) {
    return <Outlet />;
  }

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-3xl space-y-5 px-4 pb-20 pt-4 md:px-8">
        {returnTo && (
          <div className="flex items-center justify-between gap-2 rounded-2xl border border-gold/30 bg-gold/5 p-3 text-xs">
            <span>{t("wmain.create_wallet_return_hint")}</span>
            <a
              href={returnTo}
              className="inline-flex items-center gap-1 rounded-lg gradient-gold px-3 py-1.5 font-bold text-gold-foreground"
            >
              <ArrowLeft className="h-3 w-3" />
              {t("wmain.back_to_dapp")}
            </a>
          </div>
        )}
        <header className="flex items-center gap-2">
          <WalletIcon className="h-5 w-5 text-gold" />
          <h1 className="font-display text-2xl font-bold">{t("wmain.title")}</h1>
        </header>

        {/* Переход из коша на главную сервиса (по задаче «кош → главная»).
            Обычная <a> — работает в любом состоянии роутера. */}
        <a
          href="/home"
          className="group relative block overflow-hidden rounded-2xl p-[1.5px] shadow-gold transition hover:scale-[1.01]"
        >
          <span
            className="pointer-events-none absolute -inset-[60%] animate-spin"
            style={{
              animationDuration: "6s",
              background:
                "conic-gradient(from 0deg, transparent 0 58%, var(--color-gold) 82%, transparent 100%)",
            }}
          />
          <span className="relative flex items-center gap-3.5 rounded-2xl bg-card/95 px-4 py-3.5 backdrop-blur-xl">
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-gold-foreground"
              style={{ background: "var(--gradient-gold)" }}
            >
              <Sparkles className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-display text-base font-bold">
                {t("wmain.open")} <span className="text-gradient-gold">YupLink</span>
              </span>
              <span className="block text-xs text-muted-foreground">
                {t("wmain.open_yuplink_subtitle")}
              </span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-gold transition group-hover:translate-x-1" />
          </span>
        </a>

        {/* Ресурсный счёт: деньги внутри игры. Живёт в базе, поэтому виден и
            без подключённого коша — тот нужен только чтобы подписать
            пополнение. Блок сам решает, показываться ли: кому механика не
            открыта, тот не видит ничего. */}
        <AccountSection />

        {!walletConnected ? (
          <div className="rounded-2xl border border-border bg-card p-6 text-center">
            <button
              onClick={() => setWalletModalOpen(true)}
              className="rounded-xl gradient-gold px-5 py-2.5 text-sm font-bold text-gold-foreground shadow-gold transition hover:scale-[1.01]"
            >
              {t("auth.tg_login")}
            </button>
          </div>
        ) : (
          <>
            <div className="inline-flex items-center gap-2 rounded-full border border-success/30 bg-success/5 px-3 py-1 text-xs font-semibold">
              <Shield className="h-3.5 w-3.5 text-success" />
              Non-custodial
            </div>

            {/* Установка PWA — durable storage, ключ не вытесняется. Сам прячется,
                если уже установлено / нечего предлагать. */}
            <InstallAppBanner />

            {/* MyWalletSection теперь сам содержит вкладку dApps
                (ConnectedDappsSection) — отдельно её больше не рендерим,
                чтобы не было дубля. */}
            <MyWalletSection />

            {session?.isAdmin && (
              <div className="rounded-xl border border-neon/30 bg-neon/5 p-3 text-xs">
                <Link to="/admin/wallet" className="font-medium text-neon underline">
                  {t("wmain.open_admin_wallets_view")}
                </Link>
              </div>
            )}
          </>
        )}
      </div>

      <TelegramLoginModal open={walletModalOpen} onClose={() => setWalletModalOpen(false)} />
    </AppShell>
  );
}
