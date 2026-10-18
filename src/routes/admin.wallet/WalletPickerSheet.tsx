import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Wallet as WalletIcon, Plus, Check, X } from "lucide-react";
import { myWalletBalances } from "@/server/api/embedded";
import { FAST_QUERY_OPTS } from "./types";
import { formatYocto, midTruncate } from "@/components/wallet/format";
import { cn } from "@/lib/utils";

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

export function WalletPickerSheet({
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
