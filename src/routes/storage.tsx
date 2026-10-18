// /storage — отдельный сервис: свой кошелёк (не сессия приложения), его
// NFT-контракты и вывод NEAR, накопившихся в хранилище сверх нужного.
import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, Loader2, PackageOpen, PiggyBank, RefreshCw } from "lucide-react";
import { LangSwitch } from "@/components/LangSwitch";
import { StorageStoreCard } from "@/components/storage/StorageStoreCard";
import { StorageWalletBar } from "@/components/storage/StorageWalletBar";
import { useStorageClaim } from "@/components/storage/useStorageClaim";
import { humanError } from "@/lib/humanError";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/storage")({
  head: () => ({ meta: [{ title: "NFT storage — YupLink" }] }),
  component: StoragePage,
});

function StoragePage() {
  const t = useT();
  const s = useStorageClaim();
  const stores = s.list.data ?? [];

  return (
    <div className="relative min-h-screen">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-grid opacity-40" />
      <div className="mx-auto max-w-2xl px-4 pb-[calc(env(safe-area-inset-bottom)+32px)] pt-6">
        <header className="mb-4 flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold/15 text-gold">
            <PiggyBank className="h-5 w-5" />
          </span>
          <h1 className="min-w-0 flex-1 font-display text-xl font-bold leading-tight">
            {t("storage.title")}
          </h1>
          {s.owner && (
            <button
              type="button"
              onClick={() => void s.list.refetch()}
              disabled={s.list.isFetching}
              aria-label={t("storage.retry")}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-secondary/40 text-muted-foreground transition hover:text-foreground disabled:opacity-50"
            >
              <RefreshCw className={s.list.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            </button>
          )}
          <LangSwitch variant="pill" className="shrink-0" />
        </header>

        <StorageWalletBar
          signers={s.signers}
          owner={s.owner}
          secrets={s.secrets}
          onPick={s.pickOwner}
          onConnect={() => void s.connect()}
          onDisconnect={() => void s.disconnect()}
        />

        {s.owner && (
          <div className="mt-4">
            {s.list.isLoading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : s.list.isError ? (
              <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span className="flex-1">{humanError(s.list.error)}</span>
                <button
                  type="button"
                  onClick={() => void s.list.refetch()}
                  className="font-semibold underline"
                >
                  {t("storage.retry")}
                </button>
              </div>
            ) : stores.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
                <PackageOpen className="h-8 w-8" />
                <span className="text-sm">{t("storage.empty")}</span>
              </div>
            ) : (
              <div className="space-y-3">
                {stores.map((store) => (
                  <StorageStoreCard
                    key={store.contract}
                    store={store}
                    busy={s.busy === store.contract}
                    disabled={s.busy !== null}
                    onClaim={(x) => void s.claim(x)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
