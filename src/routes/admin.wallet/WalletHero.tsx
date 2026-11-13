import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Wallet as WalletIcon,
  Settings,
  Check,
  Copy,
  ChevronsUpDown,
} from "lucide-react";
import { myWalletBalances, myWalletNfts } from "@/server/api/embedded";
import { FAST_QUERY_OPTS } from "./types";
import { formatYocto, midTruncate } from "@/components/wallet/format";
import { WalletActionRow, WalletStats } from "@/components/wallet/WalletActions";
import { BalanceSkeleton } from "@/components/wallet/Skeletons";
import { CountUp } from "@/components/wallet/CountUp";

export function WalletHero({
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
  const nfts = useQuery({
    queryKey: ["my", "wallet", accountId, "nfts"],
    queryFn: () => myWalletNfts({ data: { accountId } }),
    staleTime: 60_000,
    ...FAST_QUERY_OPTS,
  });

  const near = bal.data ? formatYocto(bal.data.nearYocto) : null;
  const ftCount = bal.data?.fts.length ?? 0;
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
      <div className="relative overflow-hidden rounded-3xl border border-gold/30 bg-gradient-to-br from-gold/[0.14] via-amber-500/[0.05] to-violet-500/[0.06] p-4 shadow-gold">
        <div className="pointer-events-none absolute -right-16 -top-20 h-44 w-44 rounded-full bg-gold/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-12 h-40 w-40 rounded-full bg-violet-500/15 blur-3xl" />
        <div className="bg-noise pointer-events-none absolute inset-0 opacity-40" />
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="animate-hero-sheen absolute inset-y-0 -left-1/4 w-1/3 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        </div>
        <img
          src="/yuplink-logo.webp"
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
          <div className="mt-2 flex min-h-[2.75rem] items-end gap-2">
            {bal.isLoading ? (
              <BalanceSkeleton />
            ) : (
              <>
                <CountUp
                  value={near ?? "0"}
                  className="font-display text-[2.5rem] font-bold leading-none tracking-tight text-foreground tabular-nums"
                />
                <span className="pb-1 text-base font-semibold text-gold">NEAR</span>
              </>
            )}
          </div>
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
      <WalletStats
        accountId={accountId}
        tokenCount={tokenCount}
        nftCount={nftCount}
        loading={bal.isLoading || nfts.isLoading}
      />
    </div>
  );
}
