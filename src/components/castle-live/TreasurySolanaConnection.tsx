// Привязка Solana-кошелька (Phantom) — отдельной кнопкой в ленте Казны, сразу
// под NEAR. НЕ вход, только расширение. Показывается при флаге solana_connect.
import { Wallet, Check } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base64 } from "@scure/base";
import { useLang } from "@/lib/i18n";
import { getSession } from "@/server/api/user-auth";
import { solanaNonce, solanaAttach, solanaStatus, solanaUnlink } from "@/server/api/solana";

const buttonClass =
  "min-h-11 rounded-xl border border-border bg-secondary/40 px-4 py-2 text-left text-sm font-semibold hover:bg-secondary disabled:opacity-50";

/* eslint-disable @typescript-eslint/no-explicit-any */
function phantom(): any {
  if (typeof window === "undefined") return null;
  const w = window as any;
  return w.phantom?.solana ?? (w.solana?.isPhantom ? w.solana : null);
}
const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

export function TreasurySolanaConnection() {
  const en = useLang() === "en";
  const qc = useQueryClient();
  const session = useQuery({ queryKey: ["session"], queryFn: () => getSession() });
  const feats = (session.data as { features?: Record<string, boolean> } | undefined)?.features;
  const on = !!feats?.solana_connect;
  const status = useQuery({ queryKey: ["solana-status"], queryFn: () => solanaStatus(), enabled: on });

  const link = useMutation({
    mutationFn: async () => {
      const p = phantom();
      if (!p) {
        window.open("https://phantom.app/", "_blank");
        throw new Error(en ? "Phantom wallet needed" : "Нужен кошелёк Phantom");
      }
      const resp = await p.connect();
      const address: string = resp.publicKey.toString();
      const { message } = await solanaNonce();
      const signed = await p.signMessage(new TextEncoder().encode(message), "utf8");
      const sig: Uint8Array = signed?.signature ?? signed;
      await solanaAttach({ data: { address, signature: base64.encode(sig) } });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["solana-status"] }),
  });
  const unlink = useMutation({
    mutationFn: () => solanaUnlink(),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["solana-status"] }),
  });

  if (!on) return null;
  const addr = status.data?.address ?? null;

  // Привязан — компактная строка в стиле блока кошелька.
  if (addr) {
    return (
      <div className="castle-profile__wallet rounded-xl border border-border p-3" aria-busy={unlink.isPending}>
        <div className="castle-profile__wallet-heading">
          <Wallet aria-hidden="true" />
          <div>
            <h3>Solana</h3>
            <p className="castle-profile__wallet-status castle-profile__wallet-status--connected">
              <Check aria-hidden="true" />
              {short(addr)}
              {status.data?.sol != null ? ` · ${status.data.sol} SOL` : ""}
            </p>
          </div>
        </div>
        <button
          data-game-button="secondary"
          className={buttonClass}
          disabled={unlink.isPending}
          onClick={() => unlink.mutate()}
        >
          {en ? "Disconnect Solana" : "Отвязать Solana"}
        </button>
      </div>
    );
  }

  // Не привязан — просто кнопка (не отдельный блок), сразу под NEAR.
  return (
    <>
      <button
        data-game-button="primary"
        type="button"
        className="castle-profile__wallet-cta inline-flex w-full items-center justify-center gap-2"
        disabled={link.isPending}
        onClick={() => link.mutate()}
      >
        <Wallet aria-hidden="true" className="h-4 w-4" />
        {link.isPending ? (en ? "Connecting…" : "Подключение…") : en ? "Connect Phantom" : "Привязать Phantom"}
      </button>
      {link.isError && (
        <p role="alert" className="text-sm">
          {link.error instanceof Error ? link.error.message : ""}
        </p>
      )}
    </>
  );
}
