// Один NFT-контракт: сколько лежит сверх хранилища и кнопка «Забрать».
// Забирать может только владелец магазина; минтеру показываем, кто владелец.
import { ExternalLink, Loader2, PiggyBank } from "lucide-react";
import { formatYocto } from "@/components/wallet/format";
import { useT } from "@/lib/i18n";
import { MIN_CLAIM, type StoreInfo } from "./storageChain";

export function StorageStoreCard({
  store,
  busy,
  disabled,
  onClaim,
}: {
  store: StoreInfo;
  busy: boolean;
  disabled: boolean;
  onClaim: (s: StoreInfo) => void;
}) {
  const t = useT();
  const isOwner = store.role === "owner";
  const empty = BigInt(store.claimable) < MIN_CLAIM;
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <a
            href={`https://nearblocks.io/address/${store.contract}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex max-w-full items-center gap-1.5 font-mono text-sm font-semibold hover:text-gold"
          >
            <span className="truncate">{store.contract}</span>
            <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </a>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="rounded bg-secondary/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase">
              {store.family === "hot" ? "HOT" : "Mintbase"}
            </span>
            <span className="truncate">
              {isOwner ? t("storage.role_owner") : t("storage.role_minter", { owner: store.owner })}
            </span>
          </div>
        </div>
        {isOwner && (
          <div className="shrink-0 text-right">
            <div className="font-display text-xl font-bold tabular-nums">
              {formatYocto(store.claimable)}
            </div>
            <div className="text-xs text-muted-foreground">NEAR</div>
          </div>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl bg-secondary/40 px-3 py-2">
          <div className="text-muted-foreground">{t("storage.balance")}</div>
          <div className="font-display text-sm font-semibold tabular-nums">
            {formatYocto(store.balance)}
          </div>
        </div>
        <div className="rounded-xl bg-secondary/40 px-3 py-2">
          <div className="text-muted-foreground">{t("storage.used")}</div>
          <div className="font-display text-sm font-semibold tabular-nums">
            {formatYocto(store.storage)}
          </div>
        </div>
      </div>

      {isOwner && (
        <button
          type="button"
          onClick={() => onClaim(store)}
          disabled={busy || disabled || empty}
          className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl gradient-gold text-sm font-bold text-gold-foreground shadow-gold transition hover:brightness-110 disabled:opacity-50 disabled:shadow-none"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PiggyBank className="h-4 w-4" />}
          {t("storage.claim_btn")}
        </button>
      )}
    </div>
  );
}
