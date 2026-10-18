// Чьи NFT жечь: подключённый внешний кошелёк или кошельки YupLink этого браузера.
import { Loader2, Plug, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { BurnSigner } from "./burnSigners";

export function BurnWalletPicker({
  signers,
  owner,
  onPick,
  onConnect,
}: {
  signers: BurnSigner[] | null;
  owner: string | null;
  onPick: (accountId: string) => void;
  onConnect: () => void;
}) {
  const t = useT();
  if (signers === null) {
    return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;
  }
  const hasExternal = signers.some((s) => s.kind === "external");
  return (
    <div className="flex flex-wrap gap-2">
      {signers.map((s) => (
        <button
          key={s.accountId}
          type="button"
          onClick={() => onPick(s.accountId)}
          className={cn(
            "inline-flex min-h-11 max-w-full items-center gap-2 rounded-xl border px-3 text-sm transition",
            s.accountId === owner
              ? "border-gold/70 bg-gold/10 text-foreground"
              : "border-border bg-secondary/40 text-muted-foreground hover:text-foreground",
          )}
        >
          <Wallet className="h-4 w-4 shrink-0" />
          <span className="truncate font-mono">{s.accountId}</span>
          {s.kind === "yuplink" && (
            <span className="shrink-0 text-[10px] font-semibold uppercase text-muted-foreground">
              YupLink
            </span>
          )}
        </button>
      ))}
      {!hasExternal && (
        <button
          type="button"
          onClick={onConnect}
          className={cn(
            "inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold transition",
            signers.length === 0
              ? "gradient-gold text-gold-foreground shadow-gold"
              : "border border-dashed border-border text-muted-foreground hover:text-foreground",
          )}
        >
          <Plug className="h-4 w-4" />
          {t("burn.connect")}
        </button>
      )}
    </div>
  );
}
