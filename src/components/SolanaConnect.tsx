// Привязка Solana-кошелька (Phantom) к аккаунту. НЕ вход — расширение.
// Показывается только при флаге solana_connect. Логин и NEAR-поток не трогает.
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { base64 } from "@scure/base";
import { getSession } from "@/server/api/user-session";
import { solanaNonce, solanaAttach, solanaStatus, solanaUnlink } from "@/server/api/solana";

/* eslint-disable @typescript-eslint/no-explicit-any */
function phantom(): any {
  if (typeof window === "undefined") return null;
  const w = window as any;
  return w.phantom?.solana ?? (w.solana?.isPhantom ? w.solana : null);
}
const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

export function SolanaConnect() {
  const qc = useQueryClient();
  const session = useQuery({ queryKey: ["session"], queryFn: () => getSession() });
  const feats = (session.data as { features?: Record<string, boolean> } | undefined)?.features;
  const on = !!feats?.solana_connect;
  const status = useQuery({
    queryKey: ["solana-status"],
    queryFn: () => solanaStatus(),
    enabled: on,
  });

  const link = useMutation({
    mutationFn: async () => {
      const p = phantom();
      if (!p) {
        window.open("https://phantom.app/", "_blank");
        throw new Error("Нужен кошелёк Phantom");
      }
      const resp = await p.connect();
      const address: string = resp.publicKey.toString();
      const { message } = await solanaNonce();
      const signed = await p.signMessage(new TextEncoder().encode(message), "utf8");
      const sig: Uint8Array = signed?.signature ?? signed;
      await solanaAttach({ data: { address, signature: base64.encode(sig) } });
    },
    onSuccess: () => {
      toast.success("Solana-кошелёк привязан");
      void qc.invalidateQueries({ queryKey: ["solana-status"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Не вышло привязать"),
  });

  const unlink = useMutation({
    mutationFn: () => solanaUnlink(),
    onSuccess: () => {
      toast.success("Отвязано");
      void qc.invalidateQueries({ queryKey: ["solana-status"] });
    },
  });

  if (!on) return null;
  const addr = status.data?.address ?? null;

  return (
    <div className="rounded-xl border border-border/50 bg-secondary/40 px-3 py-2.5">
      <div className="flex items-center justify-between">
        <div className="text-xs font-display font-bold text-muted-foreground">Solana-кошелёк</div>
        {addr ? (
          <button
            onClick={() => unlink.mutate()}
            disabled={unlink.isPending}
            className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
          >
            отвязать
          </button>
        ) : null}
      </div>
      {addr ? (
        <div className="mt-1 space-y-0.5">
          <div className="font-mono text-sm">{short(addr)}</div>
          <div className="text-[11px] text-muted-foreground">
            {status.data?.sol != null ? `${status.data.sol} SOL` : "баланс…"}
            {status.data?.tokens?.length ? ` · токенов: ${status.data.tokens.length}` : ""}
          </div>
        </div>
      ) : (
        <button
          onClick={() => link.mutate()}
          disabled={link.isPending}
          className="mt-1.5 w-full rounded-lg bg-gold/15 py-2 text-sm font-semibold text-gold transition hover:bg-gold/25 disabled:opacity-50"
        >
          {link.isPending ? "Подключение…" : "Привязать Phantom"}
        </button>
      )}
    </div>
  );
}
