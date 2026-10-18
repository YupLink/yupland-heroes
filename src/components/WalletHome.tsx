// «Кош наоборот» (одобрено 03.07): '/' — кошелёк. Из коша один переход —
// на главную сервиса (/home, старый лендинг 1-в-1). Гость видит вход в кош.
// Без beforeLoad-редиректов (ломали клиентский роутинг).

import { useEffect, useState } from "react";
import { useLocation } from "@tanstack/react-router";
import { WalletModal } from "@/components/WalletModal";
import { TelegramLoginButton } from "@/components/TelegramLoginButton";
import { MyWalletSection } from "@/routes/admin.wallet";
import { InstallAppBanner } from "@/components/Pwa";
import { GoldParticles } from "@/components/GoldParticles";
import { listLocalWallets } from "@/lib/embeddedWallet";
import { useAppStore } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { LangSwitch } from "@/components/LangSwitch";
import { Shield, Wallet as WalletIcon, ChevronRight, Sparkles, Plug } from "lucide-react";

/** Локальные (встроенные) коши на этом устройстве. Только клиент:
 * IndexedDB нет на SSR — useQuery кэшировал бы серверную ошибку. */
function useLocalWallets(): string[] | null {
  const [locals, setLocals] = useState<string[] | null>(null);
  useEffect(() => {
    let alive = true;
    listLocalWallets()
      .then((l) => alive && setLocals(l))
      .catch(() => alive && setLocals([]));
    return () => {
      alive = false;
    };
  }, []);
  return locals;
}

/** href на /home с сохранением query (?ref=... должен доехать до лендинга —
 * его ловят оба пути подключения). Считается через роутер и на SSR, и на
 * клиенте → ссылка верна ещё ДО гидрации (клик в первые секунды не теряет ref). */
function useHomeHref(): string {
  const searchStr = useLocation({
    select: (l) => (l as { searchStr?: string }).searchStr ?? "",
  });
  return "/home" + (searchStr || "");
}

/** Фон: глубокий тёмный + мягкие золотые свечения. */
function WalletBackdrop({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div
        className="pointer-events-none absolute -top-40 left-1/2 h-96 w-[42rem] -translate-x-1/2 rounded-full opacity-25 blur-3xl"
        style={{
          background: "radial-gradient(closest-side, oklch(0.83 0.16 88 / 0.55), transparent)",
        }}
      />
      <div
        className="pointer-events-none absolute -bottom-48 -right-32 h-96 w-96 rounded-full opacity-15 blur-3xl"
        style={{
          background: "radial-gradient(closest-side, oklch(0.86 0.13 200 / 0.5), transparent)",
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-25" />
      {children}
    </div>
  );
}

function WalletTopBar() {
  const homeHref = useHomeHref();
  const t = useT();
  return (
    <header className="relative z-10 mx-auto flex w-full max-w-lg items-center justify-between px-5 pt-5">
      <a href={homeHref} className="flex items-center gap-2.5">
        <img src="/icons/icon-192-2.png" alt="" className="h-9 w-9 rounded-2xl shadow-gold" />
        <div className="leading-tight">
          <div className="font-display text-base font-bold">
            YupLink <span className="text-gradient-gold">{t("whome.wallet")}</span>
          </div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            NEAR · self-custody
          </div>
        </div>
      </a>
      <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-success">
        <Shield className="h-3 w-3" />
        Non-custodial
      </span>
    </header>
  );
}

/** Единственный переход из коша в сервис — на главную YupLink (/home).
 * Обычная <a> (полная загрузка) — работает в любом состоянии роутера. */
function ServiceEntryCard() {
  const homeHref = useHomeHref();
  const t = useT();
  return (
    <a
      href={homeHref}
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
            {t("whome.open")} <span className="text-gradient-gold">YupLink</span>
          </span>
          <span className="block text-xs text-muted-foreground">{t("whome.service_tagline")}</span>
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-gold transition group-hover:translate-x-1" />
        <span className="animate-shimmer pointer-events-none absolute inset-0 rounded-2xl" />
      </span>
    </a>
  );
}

/** АКТИВНЫЙ внешний кош (HOT и др.) — компактная строка + «Отключить».
 * Правило экрана: сверху всегда активный кош, от него работает сервис. */
function ExternalWalletCard({ address }: { address: string }) {
  const [busy, setBusy] = useState(false);
  const t = useT();
  const short = address.length > 26 ? `${address.slice(0, 12)}…${address.slice(-8)}` : address;
  const disconnect = async () => {
    setBusy(true);
    try {
      const { getConnector } = await import("@/lib/near-connector");
      const c = await getConnector();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (c as any)?.signOut?.();
    } catch {
      /* коннектор мог быть не инициализирован */
    }
    try {
      const { disconnectWallet } = await import("@/server/api/user");
      await disconnectWallet();
    } catch {
      /* ignore */
    }
    useAppStore.getState().setWallet(null);
    window.location.href = "/";
  };
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-neon/40 bg-neon/5 px-4 py-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-neon/15 text-neon">
        <Plug className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate font-mono text-sm font-bold">{short}</div>
        <div className="text-[11px] text-muted-foreground">{t("whome.external_via_connector")}</div>
      </div>
      <span className="shrink-0 rounded-full border border-success/40 bg-success/10 px-2 py-0.5 text-[10px] font-bold uppercase text-success">
        {t("whome.active")}
      </span>
      <button
        onClick={disconnect}
        disabled={busy}
        title={t("whome.disconnect_external_wallet")}
        className="shrink-0 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-bold text-muted-foreground transition hover:border-destructive/50 hover:text-destructive disabled:opacity-50"
      >
        {busy ? "…" : t("whome.disconnect")}
      </button>
    </div>
  );
}

/** Залогинен: кошелёк + один вход в сервис. */
export function WalletHome() {
  const walletAddress = useAppStore((s) => s.walletAddress);
  const locals = useLocalWallets();
  const [connectOpen, setConnectOpen] = useState(false);
  const t = useT();
  // Сессия есть, но такого коша нет среди локальных → подключён внешний.
  const isExternal = !!walletAddress && locals !== null && !locals.includes(walletAddress);
  return (
    <WalletBackdrop>
      <GoldParticles count={14} />
      <WalletTopBar />
      <main className="relative z-10 mx-auto w-full max-w-lg space-y-4 px-4 pb-16 pt-4">
        <ServiceEntryCard />
        {isExternal && walletAddress && <ExternalWalletCard address={walletAddress} />}
        <InstallAppBanner />
        {/* «Кош — это кош»: блок кошелька показываем только если на
            устройстве ЕСТЬ наш встроенный кош. Активен внешний и нашего
            нет → не рисуем «есть кошелёк»; завести можно кнопкой ниже. */}
        {isExternal && (locals?.length ?? 0) > 0 && (
          <div className="pt-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            {t("whome.embedded_wallet_on_device")}
          </div>
        )}
        {(!isExternal || (locals?.length ?? 0) > 0) && <MyWalletSection />}

        {/* Подключить ЕЩЁ один кошелёк (в т.ч. внешний HOT) — активная
            сессия переключится на него; балансы/паки общие по TG-группе. */}
        <button
          onClick={() => setConnectOpen(true)}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card/60 py-3 text-sm font-bold text-muted-foreground transition hover:border-gold/40 hover:text-foreground"
        >
          <Plug className="h-4 w-4" />
          {t("whome.connect_another_wallet")}
        </button>
      </main>
      <footer className="relative z-10 pb-6 text-center text-[10px] text-muted-foreground/60">
        {t("whome.key_only_on_device")}
      </footer>
      <WalletModal open={connectOpen} onClose={() => setConnectOpen(false)} />
    </WalletBackdrop>
  );
}

/** Гость: ТОЛЬКО вход в кошелёк — без коша дальше не пускаем.
 * Минимум текста, mobile-first (эталон Xiaomi 13T): 100dvh, safe-area,
 * крупные тач-цели. */
export function WalletWelcome() {
  // Вход в YupLink — ТОЛЬКО через Telegram (курс: ТГ = личность). Кошелёк —
  // атрибут: привязывается уже ВНУТРИ приложения (WalletHome/«Добавить кошелёк»),
  // а не как вход. Существующие коши-твинки без ТГ остаются в БД как есть.
  const t = useT();
  return (
    <WalletBackdrop>
      <GoldParticles count={18} />
      <div className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-sm flex-col items-center justify-center px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] text-center">
        {/* Кош-орб */}
        <div className="relative mb-6">
          <div className="absolute inset-0 -m-7 animate-pulse rounded-full bg-gold/25 blur-2xl" />
          <div
            className="relative flex h-24 w-24 items-center justify-center rounded-[1.75rem] shadow-gold sm:h-28 sm:w-28"
            style={{ background: "var(--gradient-gold)" }}
          >
            <WalletIcon className="h-11 w-11 text-gold-foreground sm:h-12 sm:w-12" />
          </div>
        </div>

        <h1 className="font-display text-[2.4rem] font-bold leading-[1.05] tracking-tight sm:text-5xl">
          YupLink
          <span className="block text-gradient-gold">{t("whome.wallet")}</span>
        </h1>
        <p className="mt-2.5 text-sm text-muted-foreground">{t("whome.ecosystem_wallet")}</p>

        {/* ОСНОВНОЙ вход — по Telegram, без кошелька (курс: ТГ = личность). */}
        <div className="mt-9 w-full">
          <TelegramLoginButton />
        </div>

        <div className="mt-6 text-xs text-muted-foreground/60">
          {t("whome.built_with_community")}
        </div>

        {/* Язык — прямо здесь: приложение открывается на английском, и человек
            должен суметь переключиться до входа, а не искать настройку внутри. */}
        <LangSwitch variant="pill" className="mt-7" />

        {/* Подвал — прижат к низу экрана */}
        <div className="absolute bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-0 right-0 text-center text-[11px] text-muted-foreground/50">
          2026 YupLand
        </div>
      </div>
    </WalletBackdrop>
  );
}
