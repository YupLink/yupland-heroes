// YupLink Wallet · Connected dApps.
// Список dApp'ов, которым юзер выдал FCAK/FullAccess через /wallet/connect.
// Каждое подключение можно ревокнуть — DeleteKey on-chain + mark в БД.

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  KeyRound,
  Trash2,
  ShieldCheck,
  ShieldAlert,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Plug,
  Lock,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  listLocalWallets,
  signAndSendTx,
} from "@/lib/embeddedWallet";
import { deleteKeyAction } from "@/lib/nearTx";
import { base58 } from "@scure/base";
import { humanError } from "@/lib/humanError";
import {
  listMyDappConnections,
  markDappConnectionRevoked,
} from "@/server/api/walletConnect";

interface DappConn {
  id: string;
  wallet: string;
  dappOrigin: string;
  dappName: string | null;
  dappIconUrl: string | null;
  publicKey: string;
  contractId: string | null;
  methods: string[] | null;
  allowanceYocto: string | null;
  grantedAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  grantedTxHash: string | null;
  revokedTxHash: string | null;
}

function yoctoToNearShort(y: string | null): string {
  if (!y) return "∞";
  try {
    const num = Number(BigInt(y)) / 1e24;
    if (num < 0.001) return num.toExponential(1);
    return num.toFixed(num < 1 ? 3 : 2);
  } catch {
    return y;
  }
}

function formatDate(s: string | null): string {
  if (!s) return "—";
  try {
    const d = new Date(s);
    return d.toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return s;
  }
}

export function ConnectedDappsSection() {
  const [wallets, setWallets] = useState<string[]>([]);
  const [selectedWallet, setSelectedWallet] = useState<string>("");
  const [showRevoked, setShowRevoked] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const list = await listLocalWallets();
        setWallets(list);
        if (list.length > 0 && !selectedWallet) setSelectedWallet(list[0]);
      } catch {
        setWallets([]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (wallets.length === 0) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Plug className="h-4 w-4 text-gold" />
          <h2 className="font-display text-base font-bold">
            Подключённые dApp'ы
          </h2>
        </div>
        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <input
            type="checkbox"
            checked={showRevoked}
            onChange={(e) => setShowRevoked(e.target.checked)}
            className="h-3.5 w-3.5 accent-gold"
          />
          Показать отключённые
        </label>
      </div>

      {wallets.length > 1 && (
        <select
          value={selectedWallet}
          onChange={(e) => setSelectedWallet(e.target.value)}
          className="mb-3 w-full rounded-xl border border-border bg-secondary/40 px-3 py-2 text-xs outline-none focus:border-gold/50"
        >
          {wallets.map((w) => (
            <option key={w} value={w}>
              {w}
            </option>
          ))}
        </select>
      )}

      {selectedWallet && (
        <DappConnectionsList
          wallet={selectedWallet}
          includeRevoked={showRevoked}
        />
      )}
    </section>
  );
}

function DappConnectionsList({
  wallet,
  includeRevoked,
}: {
  wallet: string;
  includeRevoked: boolean;
}) {
  const q = useQuery({
    queryKey: ["my-dapp-connections", wallet, includeRevoked],
    queryFn: () =>
      listMyDappConnections({
        data: { wallet, includeRevoked },
      }) as Promise<DappConn[]>,
  });

  if (q.isLoading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  const rows = q.data ?? [];
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-secondary/20 p-4 text-center text-xs text-muted-foreground">
        Ещё нет подключений. Когда dApp запросит доступ — он появится здесь.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <DappConnectionRow key={r.id} row={r} />
      ))}
    </div>
  );
}

function DappConnectionRow({ row }: { row: DappConn }) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [pin, setPin] = useState("");
  const [needsPin, setNeedsPin] = useState(true);

  const isFullAccess = !row.contractId;
  const isRevoked = !!row.revokedAt;

  const revoke = useMutation({
    mutationFn: async () => {
      const pubKeyB58 = row.publicKey.replace(/^ed25519:/, "");
      const raw = base58.decode(pubKeyB58);
      if (raw.length !== 32) throw new Error("Невалидный public_key");
      const action = deleteKeyAction(raw);
      const r = await signAndSendTx({
        accountId: row.wallet,
        pin: needsPin ? pin : undefined,
        receiverId: row.wallet,
        actions: [action],
      });
      await markDappConnectionRevoked({
        data: { id: row.id, revokedTxHash: r.txHash },
      });
      return r;
    },
    onSuccess: () => {
      toast.success("Доступ отозван");
      qc.invalidateQueries({ queryKey: ["my-dapp-connections"] });
    },
    onError: (e: Error) => {
      toast.error(humanError(e));
    },
  });

  const dappLabel = row.dappName?.trim() || row.dappOrigin;

  return (
    <div
      className={cn(
        "rounded-xl border bg-secondary/20",
        isRevoked
          ? "border-border opacity-60"
          : isFullAccess
            ? "border-amber-400/40"
            : "border-border"
      )}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2.5 p-2.5 text-left"
      >
        {row.dappIconUrl ? (
          <img
            src={row.dappIconUrl}
            alt=""
            className="h-9 w-9 shrink-0 rounded-lg border border-border bg-background object-cover"
          />
        ) : (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground">
            <KeyRound className="h-4 w-4" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold">{dappLabel}</span>
            {isRevoked ? (
              <span className="rounded-full bg-muted/40 px-1.5 py-0.5 text-[9px] uppercase text-muted-foreground">
                revoked
              </span>
            ) : isFullAccess ? (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-400/20 px-1.5 py-0.5 text-[9px] uppercase text-amber-400">
                <ShieldAlert className="h-2.5 w-2.5" />
                full
              </span>
            ) : (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-success/20 px-1.5 py-0.5 text-[9px] uppercase text-success">
                <ShieldCheck className="h-2.5 w-2.5" />
                limited
              </span>
            )}
          </div>
          <div className="truncate text-[11px] text-muted-foreground">
            {row.dappOrigin}
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {expanded && (
        <div className="space-y-2.5 border-t border-border px-2.5 py-2.5 text-xs">
          {!isFullAccess && (
            <>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Контракт</span>
                <code className="truncate font-mono text-gold">
                  {row.contractId}
                </code>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Методы</span>
                <span className="truncate font-mono">
                  {row.methods && row.methods.length > 0
                    ? row.methods.join(", ")
                    : "все"}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Лимит газа</span>
                <span className="font-mono">
                  {yoctoToNearShort(row.allowanceYocto)} NEAR
                </span>
              </div>
            </>
          )}
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Выдан</span>
            <span>{formatDate(row.grantedAt)}</span>
          </div>
          {row.lastUsedAt && (
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Последнее использование</span>
              <span>{formatDate(row.lastUsedAt)}</span>
            </div>
          )}
          {isRevoked && (
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Отозван</span>
              <span>{formatDate(row.revokedAt)}</span>
            </div>
          )}
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Public key</span>
            <code className="truncate font-mono text-[10px]">
              {row.publicKey}
            </code>
          </div>
          {row.grantedTxHash && (
            <a
              href={`https://nearblocks.io/txns/${row.grantedTxHash}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-gold"
            >
              tx granted <ExternalLink className="h-2.5 w-2.5" />
            </a>
          )}

          {!isRevoked && (
            <div className="space-y-2 border-t border-border pt-2.5">
              <label className="flex items-center gap-1.5 text-[11px] font-semibold">
                <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                PIN кошелька для revoke
              </label>
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="••••"
                disabled={!needsPin}
                className="w-full rounded-lg border border-border bg-secondary/40 px-2.5 py-1.5 text-xs outline-none focus:border-gold/50 disabled:opacity-50"
                autoComplete="current-password"
              />
              <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <input
                  type="checkbox"
                  checked={!needsPin}
                  onChange={(e) => setNeedsPin(!e.target.checked)}
                  className="h-3 w-3 accent-gold"
                />
                Без PIN (если кошелёк без шифрования)
              </label>
              <button
                onClick={() => revoke.mutate()}
                disabled={revoke.isPending}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive hover:bg-destructive/20 disabled:opacity-50"
              >
                {revoke.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                Отозвать доступ
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
