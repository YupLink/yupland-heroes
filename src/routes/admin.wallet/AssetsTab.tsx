import { useQuery } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { myWalletBalances } from "@/server/api/embedded";
import { FAST_QUERY_OPTS } from "./types";
import { formatYocto, formatFt } from "@/components/wallet/format";
import { AssetsSkeleton } from "@/components/wallet/Skeletons";
import { cn } from "@/lib/utils";
import type { SendTarget } from "./types";

export function AssetsTab({
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
