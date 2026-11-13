// «Кош наоборот» (одобрено 03.07): '/' — кошелёк. Из коша один переход —
// на главную сервиса (/home, старый лендинг 1-в-1). Гость видит вход в кош.
// Без beforeLoad-редиректов (ломали клиентский роутинг).

import { useEffect, useState } from "react";
import { useLocation } from "@tanstack/react-router";
import { WalletModal } from "@/components/WalletModal";
import { WalletBackdrop } from "@/components/WalletBackdrop";
import { MyWalletSection } from "@/routes/admin.wallet";
import { InstallAppBanner } from "@/components/Pwa";
import { GoldParticles } from "@/components/GoldParticles";
import { listLocalWallets } from "@/lib/embeddedWallet";
import { useAppStore } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { Shield, ChevronRight, Sparkles, Plug } from "lucide-react";

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

function WalletTopBar() {
  const homeHref = useHomeHref();
  const t = useT();
  return (
    <header className="relative z-10 mx-auto flex w-full max-w-lg items-center justify-between px-5 pt-5">
      <a href={homeHref} className="flex items-center gap-2.5">
        <img src="/icons/icon-192-2.webp" alt="" className="h-9 w-9 rounded-2xl shadow-gold" />
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

export { WalletWelcome } from "@/components/WalletWelcome";
