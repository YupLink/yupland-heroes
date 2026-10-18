import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Wallet as WalletIcon,
  Plus,
  KeyRound,
  Shield,
  Copy,
  Check,
  Loader2,
  Coins,
  Image as ImageIcon,
  Send,
  Settings,
  History,
  Plug,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  Sparkles,
  Lock,
  X,
} from "lucide-react";
import {
  myWalletBalances,
  myWalletNfts,
  registerEmbeddedWallet,
} from "@/server/api/embedded";
import {
  createEmbeddedWallet,
  importEmbeddedWalletBySeed,
  importEmbeddedWalletByPrivateKey,
  derivePublicFromPrivateKey,
  listLocalWallets,
  sendNear,
  sendFt,
  sendNft,
  hasPin,
  removeLocalWallet,
} from "@/lib/embeddedWallet";
import {
  getLastActiveWallet,
  setLastActiveWallet,
} from "@/lib/walletStorage";
import {
  hasMasterPin,
} from "@/lib/masterKey";
import {
  hasAppPassword,
  isAppUnlocked,
  unlockApp,
  resetAppLockForce,
} from "@/lib/appLock";
import { NftImage } from "@/components/NftImage";
import { ConnectedDappsSection } from "@/components/ConnectedDappsSection";
import { ReceivePanel } from "@/components/wallet/ReceivePanel";
import { CountUp } from "@/components/wallet/CountUp";
import {
  WalletActionRow,
  WalletStats,
} from "@/components/wallet/WalletActions";
import {
  BalanceSkeleton,
  AssetsSkeleton,
  NftGridSkeleton,
} from "@/components/wallet/Skeletons";
import {
  formatYocto,
  formatFt,
  midTruncate,
} from "@/components/wallet/format";
import { cn } from "@/lib/utils";
import { CreateForm } from "./WalletForms";
import { ImportForm } from "./WalletForms";
import { WalletSettingsSheet } from "./WalletSettings";
import { SendModal, type SendTarget } from "./WalletSettings";
import { SeedSaveGate } from "./WalletForms";
import { PwdInput, PinInput } from "./WalletSecurity";

// Shared query options for balances/NFT: one fast retry instead of 3 with
// backoff — so on RPC failure the screen doesn't hang for seconds.
const FAST_QUERY_OPTS = { retry: 1, retryDelay: 700 } as const;

export const Route = createFileRoute("/admin/wallet")({
  head: () => ({ meta: [{ title: "YupLink Wallet — admin" }] }),
  component: AdminWalletPage,
});

function AdminWalletPage() {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-success/30 bg-success/5 p-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Shield className="h-4 w-4 text-success" />
          Non-custodial
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Бэк хранит только public_key + account_id. Приваты юзеров — в их
          localStorage браузера (опц. зашифровано PIN). Подписать за юзера
          никто (включая нас) не может.
        </p>
      </div>

      {/* Блок 1: МОЙ кошелёк (admin — тоже юзер) */}
      <MyWalletSection />

      {/* Блок 2: все юзерские embedded для аудита */}
      <AllUsersWalletsSection />
    </div>
  );
}

// ──────── МОЙ КОШЕЛЁК (как у обычного юзера) ────────

// Экспортируем для использования в публичном роуте /wallet (юзер без admin).
export { MyWalletSection, CreateForm, ImportForm };

type WalletTab = "assets" | "nft" | "history" | "dapps";

/**
 * Главный экран кошелька. Современный layout:
 *  - переключатель активного кошелька (если их >1)
 *  - hero-карточка: баланс + адрес + действия (Отправить/Получить/Swap)
 *  - сегментированные вкладки: Активы · NFT · История · dApps
 *  - всё вторичное (сид/приватник/PIN/sync/удаление/создание) — в шторке
 *    «Настройки».
 *
 * Логика (queries/mutations/PIN-флоу) полностью сохранена — изменена только
 * презентация и организация.
 */
function MyWalletSection() {
  const qc = useQueryClient();
  const [mode, setMode] = useState<"list" | "add" | "create" | "import">("list");
  const [tab, setTab] = useState<WalletTab>("assets");
  const [active, setActive] = useState<string | null>(null);
  const [showReceive, setShowReceive] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showWalletPicker, setShowWalletPicker] = useState(false);
  const [sendTarget, setSendTarget] = useState<SendTarget | null>(null);
  // App-lock: гейт входа. Тикаем раз в секунду, но ре-рендерим раздел только
  // когда состояние «заблокировано» реально меняется (авто-лок / разблокировка).
  const [locked, setLocked] = useState(
    () => hasAppPassword() && !isAppUnlocked()
  );
  useEffect(() => {
    const t = setInterval(() => {
      const l = hasAppPassword() && !isAppUnlocked();
      setLocked((prev) => (prev === l ? prev : l));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  // Единый колбэк выбора кошелька (та же логика, что была инлайн в onSelect
  // ряда пилюль) + закрытие пикера.
  const selectWallet = (a: string) => {
    setActive(a);
    setLastActiveWallet(a); // запомнить выбор — при следующем заходе откроется он
    setShowReceive(false);
    setTab("assets");
    setShowWalletPicker(false);
  };

  const local = useQuery({
    queryKey: ["local", "wallets"],
    queryFn: () => listLocalWallets(),
  });

  const wallets = local.data ?? [];

  // Держим активный кошелёк валидным. Дефолт — ПОСЛЕДНИЙ активный (из
  // localStorage), а не произвольный wallets[0]: иначе при заходе с '/'
  // (кош-наоборот) открывался случайный кош. Если last удалён/невалиден —
  // падаем на первый оставшийся.
  useEffect(() => {
    if (wallets.length === 0) {
      if (active !== null) setActive(null);
      return;
    }
    if (!active || !wallets.includes(active)) {
      const last = getLastActiveWallet();
      setActive(last && wallets.includes(last) ? last : wallets[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallets.join(",")]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["local", "wallets"] });
    qc.invalidateQueries({ queryKey: ["admin", "wallets"] });
  };

  const refreshAssets = (accountId: string) => {
    qc.invalidateQueries({ queryKey: ["my", "wallet", accountId] });
  };

  // ── Добавление: экран выбора Создать/Импорт ──
  if (mode === "add") {
    return (
      <section className="rounded-3xl border border-gold/25 bg-card/60 p-5 shadow-card">
        <SectionHeading
          icon={<Plus className="h-4 w-4" />}
          title="Добавить кошелёк"
        />
        <AddChoice
          onCreate={() => setMode("create")}
          onImport={() => setMode("import")}
          onCancel={() => setMode("list")}
        />
      </section>
    );
  }

  // ── Создание / импорт ──
  if (mode === "create") {
    return (
      <section className="rounded-3xl border border-gold/25 bg-card/60 p-5 shadow-card">
        <SectionHeading
          icon={<Plus className="h-4 w-4" />}
          title="Новый кошелёк"
        />
        <CreateForm
          onDone={(accountId) => {
            setMode("list");
            setActive(accountId);
            setLastActiveWallet(accountId);
            refresh();
          }}
          onCancel={() => setMode("add")}
        />
      </section>
    );
  }
  if (mode === "import") {
    return (
      <section className="rounded-3xl border border-gold/25 bg-card/60 p-5 shadow-card">
        <SectionHeading
          icon={<KeyRound className="h-4 w-4" />}
          title="Импорт кошелька"
        />
        <ImportForm
          onDone={(accountId) => {
            setMode("list");
            setActive(accountId);
            setLastActiveWallet(accountId);
            refresh();
          }}
          onCancel={() => setMode("add")}
        />
      </section>
    );
  }

  // ── Пустое состояние ──
  if (!local.isLoading && wallets.length === 0) {
    return (
      <section className="overflow-hidden rounded-3xl border border-gold/25 bg-gradient-to-b from-gold/[0.06] to-transparent p-6 text-center shadow-card">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gold/10 text-gold glow-gold">
          <WalletIcon className="h-8 w-8" />
        </div>
        <h2 className="font-display text-xl font-bold">Заведи кошелёк NEAR</h2>
        <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
          Создай новый аккаунт прямо в приложении или импортируй существующий по
          сид-фразе либо приватному ключу. Ключ хранится только на этом
          устройстве.
        </p>
        <div className="mx-auto mt-5 flex max-w-xs flex-col gap-2.5">
          <button
            onClick={() => setMode("add")}
            className="flex items-center justify-center gap-2 rounded-2xl gradient-gold px-4 py-3 text-sm font-bold text-gold-foreground shadow-gold transition hover:scale-[1.01]"
          >
            <Plus className="h-4 w-4" /> Добавить кошелёк
          </button>
        </div>
      </section>
    );
  }

  if (local.isLoading || !active) {
    return (
      <section className="flex items-center justify-center rounded-3xl border border-border bg-card/40 p-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </section>
    );
  }

  // App-lock: пароль на ВХОД. Пока заблокировано — вместо баланса/действий
  // показываем экран ввода пароля (закрывает hero/вкладки/отправку разом).
  if (locked) {
    return <UnlockGate onUnlocked={() => setLocked(false)} />;
  }

  return (
    <section className="space-y-3 animate-float-up">
      {/* HERO + ряд иконок-действий. Переключение кошельков — через чип
          адреса в hero (шторка-пикер «Мои кошельки»). */}
      <WalletHero
        accountId={active}
        wallets={wallets}
        onOpenPicker={() => setShowWalletPicker(true)}
        onSend={() => {
          // Дефолтное действие «Отправить» с hero — открываем модалку с NEAR.
          // SendModal внутри сам подтянет баланс/PIN. Передаём nearYocto=0,
          // пользователь введёт сумму, MAX подтянется из таргета.
          setSendTarget({ kind: "near", nearYocto: "0", lazy: true });
        }}
        onReceive={() => setShowReceive((v) => !v)}
        receiveOpen={showReceive}
        onSettings={() => setShowSettings(true)}
        onAdd={() => setMode("add")}
      />

      {/* Receive-панель (toggle из hero) */}
      {showReceive && <ReceivePanel accountId={active} />}

      {/* Сегментированные вкладки */}
      <WalletTabs tab={tab} onChange={setTab} />

      <div className="min-h-[120px]">
        {tab === "assets" && (
          <AssetsTab
            accountId={active}
            onSend={(t) => setSendTarget(t)}
          />
        )}
        {tab === "nft" && (
          <NftTab
            accountId={active}
            onSend={(t) => setSendTarget(t)}
          />
        )}
        {tab === "history" && <HistoryTab />}
        {tab === "dapps" && <ConnectedDappsSection />}
      </div>

      {/* Settings-шторка (Создать/Импорт теперь на главном экране) */}
      {showSettings && (
        <WalletSettingsSheet
          accountId={active}
          onClose={() => setShowSettings(false)}
          onRemoved={() => {
            setShowSettings(false);
            refresh();
          }}
        />
      )}

      {/* Шторка-пикер «Мои кошельки» (триггер — чип адреса в hero) */}
      {showWalletPicker && (
        <WalletPickerSheet
          wallets={wallets}
          active={active}
          onSelect={selectWallet}
          onAdd={() => {
            setShowWalletPicker(false);
            setMode("add");
          }}
          onClose={() => setShowWalletPicker(false)}
        />
      )}

      {/* Send-модалка (общая для hero/активов/NFT) */}
      {sendTarget && (
        <SendModal
          accountId={active}
          target={sendTarget}
          onClose={() => setSendTarget(null)}
          onSuccess={() => {
            setSendTarget(null);
            refreshAssets(active);
          }}
        />
      )}
    </section>
  );
}

// ──────── HERO ────────

function SectionHeading({
  icon,
  title,
}: {
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gold/10 text-gold">
        {icon}
      </span>
      <h2 className="font-display text-lg font-bold">{title}</h2>
    </div>
  );
}

/**
 * Hero-карточка: крупный баланс NEAR, account_id с копированием, ряд кнопок
 * действий. Балансовый query тот же ключ — TanStack дедуплицирует с
 * AssetsTab.
 */
function WalletHero({
  accountId,
  wallets,
  onOpenPicker,
  onSend,
  onReceive,
  receiveOpen,
  onSettings,
  onAdd,
}: {
  accountId: string;
  wallets: string[];
  onOpenPicker: () => void;
  onSend: () => void;
  onReceive: () => void;
  receiveOpen: boolean;
  onSettings: () => void;
  onAdd: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const bal = useQuery({
    queryKey: ["my", "wallet", accountId, "balances"],
    queryFn: () => myWalletBalances({ data: { accountId } }),
    staleTime: 30_000,
    ...FAST_QUERY_OPTS,
  });
  // NFT-счётчик для виджета. Тот же query-ключ, что в NftTab → дедуп.
  const nfts = useQuery({
    queryKey: ["my", "wallet", accountId, "nfts"],
    queryFn: () => myWalletNfts({ data: { accountId } }),
    staleTime: 60_000,
    ...FAST_QUERY_OPTS,
  });

  const near = bal.data ? formatYocto(bal.data.nearYocto) : null;
  const ftCount = bal.data?.fts.length ?? 0;
  // «Токены» = NEAR + найденные FT.
  const tokenCount = ftCount + 1;
  const nftCount = nfts.data?.length ?? 0;

  const copyAddress = () => {
    navigator.clipboard.writeText(accountId);
    setCopied(true);
    toast.success("Адрес скопирован");
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="space-y-3">
      {/* Премиум-карта баланса с металлическим бликом */}
      <div className="relative overflow-hidden rounded-3xl border border-gold/30 bg-gradient-to-br from-gold/[0.14] via-amber-500/[0.05] to-violet-500/[0.06] p-4 shadow-gold">
        {/* свечения: тёплое золото + холодный фиолет для глубины */}
        <div className="pointer-events-none absolute -right-16 -top-20 h-44 w-44 rounded-full bg-gold/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-12 h-40 w-40 rounded-full bg-violet-500/15 blur-3xl" />
        <div className="bg-noise pointer-events-none absolute inset-0 opacity-40" />
        {/* бегущий металлический sheen */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="animate-hero-sheen absolute inset-y-0 -left-1/4 w-1/3 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        </div>

        {/* Маскот-котик: выглядывает из-за правого края, мягко покачивается.
            Декоративный — за контентом, не перехватывает клики. */}
        <img
          src="/yuplink-logo.png"
          alt=""
          aria-hidden="true"
          draggable={false}
          className="animate-mascot-bob pointer-events-none absolute -right-5 top-12 z-0 h-28 w-28 select-none opacity-40 [filter:drop-shadow(0_0_14px_rgba(245,200,90,0.45))]"
        />

        <div className="relative z-10">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-gold/20 text-gold">
                <WalletIcon className="h-3.5 w-3.5" />
              </span>
              Общий баланс
            </div>
            <button
              onClick={onSettings}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-card/60 text-muted-foreground backdrop-blur transition hover:border-gold/40 hover:text-gold"
              title="Настройки и безопасность"
            >
              <Settings className="h-4 w-4" />
            </button>
          </div>

          {/* Баланс */}
          <div className="mt-2 flex min-h-[2.75rem] items-end gap-2">
            {bal.isLoading ? (
              <BalanceSkeleton />
            ) : (
              <>
                <CountUp
                  value={near ?? "0"}
                  className="font-display text-[2.5rem] font-bold leading-none tracking-tight text-foreground tabular-nums"
                />
                <span className="pb-1 text-base font-semibold text-gold">
                  NEAR
                </span>
              </>
            )}
          </div>

          {/* Адрес-чип: левая зона открывает пикер кошельков, правая —
              отдельная мини-кнопка копирования (две соседние кнопки, не
              вложенные). */}
          <div
            className="group mt-2.5 inline-flex min-h-[44px] items-center gap-1 rounded-full border border-border bg-card/60 px-3 py-2 text-xs backdrop-blur transition hover:border-gold/40"
            title={accountId}
          >
            <button
              type="button"
              onClick={onOpenPicker}
              className="flex items-center gap-2 outline-none"
              title="Мои кошельки"
            >
              <WalletIcon className="h-3.5 w-3.5 text-gold" />
              <span className="font-mono text-muted-foreground">
                {midTruncate(accountId)}
              </span>
              {wallets.length > 1 ? (
                <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
              ) : null}
            </button>
            <button
              type="button"
              onClick={copyAddress}
              className="ml-1 flex items-center border-l border-border/60 p-1 pl-2 outline-none"
              title="Скопировать адрес"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-success" />
              ) : (
                <Copy className="h-3.5 w-3.5 text-muted-foreground hover:text-gold" />
              )}
            </button>
          </div>

          {/* Ряд иконок-действий */}
          <div className="mt-3.5">
            <WalletActionRow
              onSend={onSend}
              onReceive={onReceive}
              receiveOpen={receiveOpen}
              onAdd={onAdd}
            />
          </div>
        </div>
      </div>

      {/* Мини-стат-виджеты на реальных данных */}
      <WalletStats
        accountId={accountId}
        tokenCount={tokenCount}
        nftCount={nftCount}
        loading={bal.isLoading || nfts.isLoading}
      />
    </div>
  );
}

// ──────── Вкладки ────────

function WalletTabs({
  tab,
  onChange,
}: {
  tab: WalletTab;
  onChange: (t: WalletTab) => void;
}) {
  // У каждой вкладки свой акцентный цвет активного состояния — больше цвета,
  // но в премиальной палитре.
  const tabs: {
    id: WalletTab;
    label: string;
    icon: React.ReactNode;
    activeCls: string;
  }[] = [
    {
      id: "assets",
      label: "Активы",
      icon: <Coins className="h-4 w-4" />,
      activeCls: "bg-gold/15 text-gold ring-1 ring-gold/30",
    },
    {
      id: "nft",
      label: "NFT",
      icon: <ImageIcon className="h-4 w-4" />,
      activeCls: "bg-violet-400/15 text-violet-300 ring-1 ring-violet-400/30",
    },
    {
      id: "history",
      label: "История",
      icon: <History className="h-4 w-4" />,
      activeCls: "bg-sky-400/15 text-sky-300 ring-1 ring-sky-400/30",
    },
    {
      id: "dapps",
      label: "dApps",
      icon: <Plug className="h-4 w-4" />,
      activeCls: "bg-cyan-400/15 text-cyan-300 ring-1 ring-cyan-400/30",
    },
  ];
  return (
    <div className="flex gap-1 rounded-2xl border border-border bg-card/50 p-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-semibold transition-all duration-200",
            tab === t.id
              ? t.activeCls
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {t.icon}
          <span className="hidden xs:inline sm:inline">{t.label}</span>
        </button>
      ))}
    </div>
  );
}

// ──────── Вкладка Активы ────────

function AssetsTab({
  accountId,
  onSend,
}: {
  accountId: string;
  onSend: (t: SendTarget) => void;
}) {
  const bal = useQuery({
    queryKey: ["my", "wallet", accountId, "balances"],
    queryFn: () => myWalletBalances({ data: { accountId } }),
    staleTime: 30_000,
    ...FAST_QUERY_OPTS,
  });

  if (bal.isLoading) {
    return <AssetsSkeleton rows={3} />;
  }

  const fts = bal.data?.fts ?? [];

  return (
    <div className="space-y-2 animate-float-up">
      {/* NEAR */}
      <AssetRow
        symbol="NEAR"
        sub="NEAR Protocol"
        amount={formatYocto(bal.data?.nearYocto ?? "0")}
        iconText="Ⓝ"
        tone="gold"
        onSend={() =>
          onSend({ kind: "near", nearYocto: bal.data?.nearYocto ?? "0" })
        }
      />

      {/* FT-токены */}
      {fts.map((f) => (
        <AssetRow
          key={f.contract_id}
          symbol={f.symbol ?? f.contract_id.slice(0, 12)}
          sub={f.contract_id}
          amount={formatFt(f.balance, f.decimals)}
          iconText={(f.symbol ?? "?").slice(0, 3).toUpperCase()}
          tone="emerald"
          onSend={
            f.symbol && f.decimals != null
              ? () =>
                  onSend({
                    kind: "ft",
                    ftContract: f.contract_id,
                    symbol: f.symbol!,
                    decimals: f.decimals!,
                    balance: f.balance,
                  })
              : undefined
          }
        />
      ))}

      {fts.length === 0 && (
        <p className="px-1 pt-1 text-xs text-muted-foreground">
          Других токенов пока нет.
        </p>
      )}
    </div>
  );
}

function AssetRow({
  symbol,
  sub,
  amount,
  iconText,
  tone = "gold",
  onSend,
}: {
  symbol: string;
  sub: string;
  amount: string;
  iconText: string;
  tone?: "gold" | "emerald";
  onSend?: () => void;
}) {
  const chip =
    tone === "emerald"
      ? "bg-emerald-400/12 text-emerald-300 ring-1 ring-emerald-400/25"
      : "bg-gold/12 text-gold ring-1 ring-gold/25";
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card/80 px-3 py-2.5 transition hover:border-gold/30">
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-display text-sm font-bold",
          chip
        )}
      >
        {iconText}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{symbol}</div>
        <div className="truncate text-[11px] text-muted-foreground" title={sub}>
          {sub}
        </div>
      </div>
      <div className="text-right">
        <div className="font-mono text-sm font-semibold tabular-nums">
          {amount}
        </div>
      </div>
      {onSend && (
        <button
          onClick={onSend}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-gold/30 bg-gold/10 text-gold transition hover:scale-105 hover:bg-gold/20 active:scale-95"
          title="Отправить"
        >
          <Send className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

// ──────── Вкладка NFT ────────

function NftTab({
  accountId,
  onSend,
}: {
  accountId: string;
  onSend: (t: SendTarget) => void;
}) {
  const nfts = useQuery({
    queryKey: ["my", "wallet", accountId, "nfts"],
    queryFn: () => myWalletNfts({ data: { accountId } }),
    staleTime: 60_000,
    ...FAST_QUERY_OPTS,
  });

  if (nfts.isLoading) {
    return <NftGridSkeleton cells={6} />;
  }

  const list = nfts.data ?? [];

  if (list.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/40 p-8 text-center">
        <ImageIcon className="mx-auto mb-2 h-7 w-7 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">NFT пока нет</p>
      </div>
    );
  }

  // Показываем ВСЕ NFT (ограничение на первые 12 убрано).
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 animate-float-up">
      {list.map((n) => (
        <button
          key={`${n.contract_id}:${n.token_id}`}
          onClick={() =>
            onSend({
              kind: "nft",
              nftContract: n.contract_id,
              tokenId: n.token_id,
              title: n.title ?? n.token_id,
            })
          }
          className="group relative overflow-hidden rounded-2xl border border-border bg-card transition hover:border-gold/50"
          title={`${n.title ?? ""} — нажми чтобы отправить`}
        >
          <NftImage
            src={n.media ?? null}
            alt={n.title ?? ""}
            className="aspect-square w-full"
          />
          {n.title && (
            <div className="truncate px-2 py-1.5 text-left text-[11px] font-medium">
              {n.title}
            </div>
          )}
          <div className="absolute inset-0 flex items-center justify-center bg-black/55 opacity-0 transition group-hover:opacity-100">
            <span className="flex items-center gap-1 rounded-full bg-gold px-3 py-1 text-[11px] font-bold text-gold-foreground">
              <Send className="h-3 w-3" /> Отправить
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}

// ──────── Вкладка История (placeholder) ────────

function HistoryTab() {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/40 p-8 text-center">
      <History className="mx-auto mb-2 h-7 w-7 text-muted-foreground/50" />
      <p className="text-sm font-medium">История транзакций — скоро</p>
      <p className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground">
        Здесь появится лента входящих и исходящих переводов по этому кошельку.
      </p>
    </div>
  );
}

// ──────── Пикер кошельков (шторка «Мои кошельки») ────────

/**
 * Ленивый баланс строки кошелька. Тот же query-ключ, что в WalletHero →
 * TanStack дедуплицирует для активного. Рендерится только для фактически
 * отрисованных строк (виртуализация в v1 не требуется).
 */
function WalletRowBalance({ accountId }: { accountId: string }) {
  const bal = useQuery({
    queryKey: ["my", "wallet", accountId, "balances"],
    queryFn: () => myWalletBalances({ data: { accountId } }),
    staleTime: 30_000,
    ...FAST_QUERY_OPTS,
  });
  if (bal.isLoading) {
    return (
      <span className="inline-block h-3 w-16 rounded bg-muted animate-pulse" />
    );
  }
  return <>{formatYocto(bal.data?.nearYocto ?? "0")} NEAR</>;
}

/**
 * Нижняя шторка-пикер «Мои кошельки». Обёртка один-в-один с
 * WalletSettingsSheet (overlay → панель → sticky-шапка). Список строк-кнопок
 * с активным выделением, поиск при >8 кошельках, залипающий футер с
 * Создать/Импорт. Логика выбора приходит через onSelect (= selectWallet).
 */
function WalletPickerSheet({
  wallets,
  active,
  onSelect,
  onAdd,
  onClose,
}: {
  wallets: string[];
  active: string;
  onSelect: (a: string) => void;
  onAdd: () => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");

  // Esc закрывает шторку.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const hasSearch = wallets.length > 8;
  const shown = hasSearch
    ? wallets.filter((w) => w.toLowerCase().includes(query.toLowerCase()))
    : wallets;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="flex max-h-[calc(100dvh-5rem)] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-gold/25 bg-card/95 shadow-card backdrop-blur-xl sm:max-h-[85vh] sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Залипающая шапка */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border/60 bg-card/90 px-5 py-4 backdrop-blur-xl">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gold/10 text-gold ring-1 ring-gold/20">
              <WalletIcon className="h-4 w-4" />
            </span>
            <h3 className="font-display text-lg font-bold">Мои кошельки</h3>
            <span className="text-sm text-muted-foreground">
              ({wallets.length})
            </span>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-secondary text-muted-foreground transition hover:border-gold/40 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Поиск (только при многих кошельках) */}
        {hasSearch && (
          <div className="sticky top-[65px] z-10 border-b border-border/60 bg-card/90 px-3 py-2.5 backdrop-blur-xl">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск по адресу…"
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none transition focus:border-gold/40"
            />
          </div>
        )}

        {/* Список кошельков */}
        <div className="space-y-1.5 overflow-y-auto px-3 py-3">
          {shown.map((w) => (
            <button
              key={w}
              onClick={() => onSelect(w)}
              className={cn(
                "group flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition",
                w === active
                  ? "border-gold/50 bg-gold/15"
                  : "border-border bg-card hover:border-gold/40"
              )}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gold/10 text-gold ring-1 ring-gold/20">
                <WalletIcon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-mono text-xs text-foreground">
                  {midTruncate(w)}
                </span>
                <span className="block text-[11px] text-muted-foreground">
                  <WalletRowBalance accountId={w} />
                </span>
              </span>
              {w === active && (
                <Check className="h-4 w-4 shrink-0 text-gold" />
              )}
            </button>
          ))}
          {hasSearch && shown.length === 0 && (
            <p className="px-1 py-4 text-center text-xs text-muted-foreground">
              Ничего не найдено.
            </p>
          )}
        </div>

        {/* Залипающий футер: одна кнопка «Добавить кошелёк» */}
        <div className="sticky bottom-0 flex gap-2 border-t border-border/60 bg-card/90 px-5 py-4 backdrop-blur-xl">
          <button
            onClick={onAdd}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl gradient-gold px-4 py-3 text-sm font-bold text-gold-foreground shadow-gold transition hover:scale-[1.01]"
          >
            <Plus className="h-4 w-4" /> Добавить кошелёк
          </button>
        </div>
      </div>
    </div>
  );
}

// ──────── ВСЕ ЮЗЕРСКИЕ КОШЕЛЬКИ (admin observer) ────────
import { AllUsersWalletsSection } from "./WalletObserver";

// ──────── Экран ввода пароля при входе (app-lock) ────────

function UnlockGate({ onUnlocked }: { onUnlocked: () => void }) {
  const [pwd, setPwd] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pwd) return;
    setBusy(true);
    try {
      await unlockApp(pwd);
      setPwd("");
      onUnlocked();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  // «Забыл пароль»: сброс замка + удаление локальных кошельков → вход заново по
  // сид-фразе/серверному бэкапу. Без сид-фразы доступа к средствам нет.
  const doReset = async () => {
    setBusy(true);
    try {
      const list = await listLocalWallets();
      for (const a of list) await removeLocalWallet(a);
      resetAppLockForce();
      toast.success("Пароль сброшен — войди по сид-фразе");
      window.location.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };
  return (
    <section className="overflow-hidden rounded-3xl border border-gold/25 bg-gradient-to-b from-gold/[0.06] to-transparent p-6 text-center shadow-card">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gold/10 text-gold glow-gold">
        <Lock className="h-8 w-8" />
      </div>
      <h2 className="font-display text-xl font-bold">Кошелёк заблокирован</h2>
      <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
        Введи пароль кошелька, чтобы открыть баланс и действия.
      </p>
      <form onSubmit={submit} className="mx-auto mt-5 flex max-w-xs flex-col gap-2.5">
        <PwdInput value={pwd} onChange={setPwd} label="Пароль кошелька" />
        <button
          type="submit"
          disabled={busy || !pwd}
          className="flex items-center justify-center gap-2 rounded-2xl gradient-gold px-4 py-3 text-sm font-bold text-gold-foreground shadow-gold transition hover:scale-[1.01] disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Lock className="h-4 w-4" />
          )}
          Разблокировать
        </button>
      </form>

      {!confirmReset ? (
        <button
          onClick={() => setConfirmReset(true)}
          className="mx-auto mt-3 block max-w-xs text-[11px] text-muted-foreground underline-offset-2 hover:text-gold hover:underline"
        >
          Забыл пароль?
        </button>
      ) : (
        <div className="mx-auto mt-3 max-w-xs space-y-2 rounded-xl border border-warning/40 bg-warning/[0.06] p-3 text-left">
          <div className="text-[11px] leading-snug text-warning/90">
            Сброс снимет пароль и удалит кошелёк с этого устройства. Вернёшь его
            импортом по сид-фразе (12 слов) или серверному бэкапу. Без сид-фразы
            доступа к деньгам нет.
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setConfirmReset(false)}
              disabled={busy}
              className="rounded-lg border border-border bg-card px-2 py-2 text-xs"
            >
              Отмена
            </button>
            <button
              onClick={doReset}
              disabled={busy}
              className="rounded-lg border border-destructive/40 bg-destructive/10 px-2 py-2 text-xs font-bold text-destructive disabled:opacity-50"
            >
              {busy ? "…" : "Сбросить"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

// ──────── AddChoice ────────

function AddChoice({
  onCreate,
  onImport,
  onCancel,
}: {
  onCreate: () => void;
  onImport: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={onCreate}
        className="group flex w-full items-center gap-3.5 rounded-2xl border border-gold/30 bg-gradient-to-br from-gold/[0.1] to-transparent p-4 text-left transition hover:border-gold/50 hover:scale-[1.01]"
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gold/15 text-gold ring-1 ring-gold/25">
          <Sparkles className="h-6 w-6" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-bold">Создать новый</span>
          <span className="block text-xs text-muted-foreground">
            Сгенерируем новый NEAR-аккаунт прямо здесь. Покажем сид-фразу один
            раз — запиши её.
          </span>
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground group-hover:text-gold" />
      </button>

      <button
        type="button"
        onClick={onImport}
        className="group flex w-full items-center gap-3.5 rounded-2xl border border-border bg-card p-4 text-left transition hover:border-gold/40 hover:scale-[1.01]"
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-400/15 text-violet-300 ring-1 ring-violet-400/25">
          <KeyRound className="h-6 w-6" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-bold">
            Импортировать существующий
          </span>
          <span className="block text-xs text-muted-foreground">
            Вставь сид-фразу или приватный ключ — определим аккаунт сами.
          </span>
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground group-hover:text-gold" />
      </button>

      <button
        type="button"
        onClick={onCancel}
        className="w-full rounded-full border border-border bg-card px-3 py-2 text-xs"
      >
        Отмена
      </button>
    </div>
  );
}
