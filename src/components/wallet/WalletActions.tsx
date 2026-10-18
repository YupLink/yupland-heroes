// Компактный ряд иконок-действий + ряд мини-стат-виджетов для hero кошелька.
// Презентационные компоненты: вся бизнес-логика остаётся в admin.wallet.tsx,
// сюда приходят только колбэки и уже посчитанные числа.

import {
  Send,
  ArrowDownLeft,
  ArrowLeftRight,
  Coins,
  Image as ImageIcon,
  Plug,
  Plus,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { listMyDappConnections } from "@/server/api/walletConnect";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

// ──────── Ряд иконок-действий ────────

type ActionTone = "gold" | "emerald" | "sky" | "violet" | "cyan";

// Палитра акцентов под каждое действие. Держим явные tailwind-классы
// (а не интерполяцию), чтобы JIT их подхватил.
const TONE: Record<
  ActionTone,
  { ring: string; bg: string; text: string; glow: string }
> = {
  gold: {
    ring: "border-gold/40",
    bg: "bg-gold/15",
    text: "text-gold",
    glow: "group-hover:shadow-lg group-hover:shadow-gold/25",
  },
  emerald: {
    ring: "border-emerald-400/40",
    bg: "bg-emerald-400/15",
    text: "text-emerald-300",
    glow: "group-hover:shadow-lg group-hover:shadow-emerald-400/25",
  },
  sky: {
    ring: "border-sky-400/40",
    bg: "bg-sky-400/15",
    text: "text-sky-300",
    glow: "group-hover:shadow-lg group-hover:shadow-sky-400/25",
  },
  violet: {
    ring: "border-violet-400/40",
    bg: "bg-violet-400/15",
    text: "text-violet-300",
    glow: "group-hover:shadow-lg group-hover:shadow-violet-400/25",
  },
  cyan: {
    ring: "border-cyan-400/40",
    bg: "bg-cyan-400/15",
    text: "text-cyan-300",
    glow: "group-hover:shadow-lg group-hover:shadow-cyan-400/25",
  },
};

function IconAction({
  icon,
  label,
  tone,
  onClick,
  disabled,
  active,
  title,
}: {
  icon: React.ReactNode;
  label: string;
  tone: ActionTone;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  title?: string;
}) {
  const t = TONE[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="group flex flex-1 flex-col items-center gap-1.5 outline-none disabled:cursor-not-allowed"
    >
      <span
        className={cn(
          "flex h-11 w-11 items-center justify-center rounded-2xl border backdrop-blur transition-all duration-200",
          disabled
            ? "border-border/50 bg-card/40 text-muted-foreground opacity-60"
            : cn(
                t.ring,
                t.bg,
                t.text,
                t.glow,
                "group-hover:scale-[1.08] group-active:scale-95",
                active && "ring-2 ring-current/40"
              )
        )}
      >
        {icon}
      </span>
      <span
        className={cn(
          "text-[10px] font-medium leading-tight",
          disabled ? "text-muted-foreground" : "text-foreground/80"
        )}
      >
        {label}
      </span>
    </button>
  );
}

/**
 * Горизонтальный ряд компактных иконок-действий.
 * Отправить · Получить · Добавить · Swap (скоро).
 * «Добавить» (одна кнопка вместо Создать/Импорт) ведёт на экран выбора
 * «Создать новый / Импортировать существующий».
 */
export function WalletActionRow({
  onSend,
  onReceive,
  receiveOpen,
  onAdd,
}: {
  onSend: () => void;
  onReceive: () => void;
  receiveOpen: boolean;
  onAdd?: () => void;
}) {
  const t = useT();
  return (
    <div className="flex items-start gap-1">
      <IconAction
        icon={<Send className="h-5 w-5" />}
        label={t("common.send")}
        tone="gold"
        onClick={onSend}
      />
      <IconAction
        icon={<ArrowDownLeft className="h-5 w-5" />}
        label={t("wactions.receive")}
        tone="emerald"
        onClick={onReceive}
        active={receiveOpen}
      />
      {onAdd && (
        <IconAction
          icon={<Plus className="h-5 w-5" />}
          label={t("common.add")}
          tone="violet"
          onClick={onAdd}
          title={t("wactions.add_wallet_hint")}
        />
      )}
      <IconAction
        icon={<ArrowLeftRight className="h-5 w-5" />}
        label="Swap"
        tone="sky"
        disabled
        title={t("wactions.swap_soon")}
      />
    </div>
  );
}

// ──────── Ряд мини-стат-виджетов ────────

function StatCard({
  icon,
  label,
  value,
  tone,
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "gold" | "violet" | "cyan";
  loading?: boolean;
}) {
  const toneCls =
    tone === "gold"
      ? "text-gold"
      : tone === "violet"
        ? "text-violet-300"
        : "text-cyan-300";
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-card/60 p-2.5 backdrop-blur">
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        <span className={toneCls}>{icon}</span>
        {label}
      </div>
      {loading ? (
        <div className="skeleton mt-1.5 h-5 w-7 rounded" />
      ) : (
        <div
          className={cn(
            "mt-0.5 font-display text-lg font-bold leading-none",
            toneCls
          )}
        >
          {value}
        </div>
      )}
    </div>
  );
}

/**
 * Три мини-виджета на РЕАЛЬНЫХ данных из существующих запросов:
 *  - токены (длина fts из myWalletBalances, +1 на NEAR)
 *  - NFT (длина myWalletNfts)
 *  - подключённые dApps (listMyDappConnections для этого кошелька)
 * Никаких выдуманных цен/истории.
 */
export function WalletStats({
  accountId,
  tokenCount,
  nftCount,
  loading,
}: {
  accountId: string;
  tokenCount: number;
  nftCount: number;
  loading?: boolean;
}) {
  // Тот же query-ключ, что в ConnectedDappsSection → дедуплицируется.
  const dapps = useQuery({
    queryKey: ["my-dapp-connections", accountId, false],
    queryFn: () =>
      listMyDappConnections({ data: { wallet: accountId, includeRevoked: false } }),
    staleTime: 60_000,
    retry: 1,
    retryDelay: 800,
  });
  const dappCount = dapps.data?.length ?? 0;
  const t = useT();

  return (
    <div className="grid grid-cols-3 gap-2">
      <StatCard
        icon={<Coins className="h-3.5 w-3.5" />}
        label={t("wactions.tokens")}
        value={tokenCount}
        tone="gold"
        loading={loading}
      />
      <StatCard
        icon={<ImageIcon className="h-3.5 w-3.5" />}
        label="NFT"
        value={nftCount}
        tone="violet"
        loading={loading}
      />
      <StatCard
        icon={<Plug className="h-3.5 w-3.5" />}
        label="dApps"
        value={dappCount}
        tone="cyan"
        loading={dapps.isLoading}
      />
    </div>
  );
}
