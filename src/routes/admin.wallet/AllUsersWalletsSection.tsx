import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users, Wallet as WalletIcon, Coins, ImageIcon, Loader2 } from "lucide-react";
import { adminListWallets, adminWalletBalances, adminWalletNfts } from "@/server/api/wallet";
import { NftImage } from "@/components/NftImage";
import { cn } from "@/lib/utils";
import type { WalletRowType } from "./types";

export function AllUsersWalletsSection() {
  const [active, setActive] = useState<string | null>(null);
  const wallets = useQuery({
    queryKey: ["admin", "wallets"],
    queryFn: () => adminListWallets(),
  });

  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-bold">
        <Users className="h-4 w-4" />
        Все юзерские embedded ({wallets.data?.length ?? 0})
      </h2>
      {wallets.isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Загрузка…
        </div>
      )}
      <div className="space-y-3">
        {(wallets.data ?? []).map((w) => (
          <ObserverWalletCard
            key={w.account_id}
            row={w}
            isOpen={active === w.account_id}
            onToggle={() => setActive((cur) => (cur === w.account_id ? null : w.account_id))}
          />
        ))}
        {wallets.data && wallets.data.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Юзеры ещё не создавали embedded-кошельки.
          </div>
        )}
      </div>
    </section>
  );
}

function ObserverWalletCard({
  row,
  isOpen,
  onToggle,
}: {
  row: WalletRowType;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <button onClick={onToggle} className="flex w-full items-center justify-between p-4 text-left">
        <div className="flex items-center gap-3">
          <WalletIcon className="h-5 w-5 text-muted-foreground" />
          <div>
            <div className="font-mono text-sm">{row.account_id}</div>
            <div className="text-xs text-muted-foreground">
              {row.label ?? "—"} · {row.linked_user ? `linked: ${row.linked_user.slice(0, 10)}…` : "anon"}
            </div>
          </div>
        </div>
        <span className={cn("text-xs", row.is_active ? "text-success" : "text-muted-foreground")}>
          {row.is_active ? "active" : "inactive"}
        </span>
      </button>
      {isOpen && <ObserverDetails accountId={row.account_id} />}
    </div>
  );
}

function ObserverDetails({ accountId }: { accountId: string }) {
  const bal = useQuery({
    queryKey: ["admin", "wallet", accountId, "balances"],
    queryFn: () => adminWalletBalances({ data: { accountId } }),
  });
  const nfts = useQuery({
    queryKey: ["admin", "wallet", accountId, "nfts"],
    queryFn: () => adminWalletNfts({ data: { accountId } }),
  });

  return (
    <div className="border-t border-border/60 bg-secondary/20 p-4">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
        <Coins className="h-3 w-3" /> Балансы
      </div>
      {bal.isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <div className="space-y-1 text-sm">
          <div>NEAR: {bal.data?.nearBalance ?? "—"}</div>
          {(bal.data?.fts ?? []).map((f) => (
            <div key={f.contract_id} className="font-mono text-xs">
              {f.symbol ?? f.contract_id}: {f.balance}
            </div>
          ))}
        </div>
      )}
      <div className="mt-4 mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
        <ImageIcon className="h-3 w-3" /> NFT ({nfts.data?.length ?? 0})
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {(nfts.data ?? []).slice(0, 15).map((n) => (
          <div key={`${n.contract_id}:${n.token_id}`} className="overflow-hidden rounded-lg border border-border/60 bg-background">
            <NftImage src={n.media ?? null} alt={n.title ?? ""} className="aspect-square w-full" />
            <div className="truncate p-1 text-[10px]">{n.title}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
