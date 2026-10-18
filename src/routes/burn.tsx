// /burn — сжечь NFT коллекции лавки (nft_batch_burn), до 120 за раз, любые
// вперемешку. Подписывает то же подключение кошелька, что и всё приложение.
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AlertTriangle, Flame, Loader2, PackageOpen, RefreshCw, Search } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { BurnGroupRow } from "@/components/burn/BurnGroupRow";
import { BurnConfirm } from "@/components/burn/BurnConfirm";
import { BurnWalletPicker } from "@/components/burn/BurnWalletPicker";
import { useNftBurn } from "@/components/burn/useNftBurn";
import { MAX_BURN } from "@/components/burn/burnPlan";
import { humanError } from "@/lib/humanError";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/burn")({
  head: () => ({ meta: [{ title: "Burn NFT — YupLink" }] }),
  component: BurnPage,
});

function BurnPage() {
  const t = useT();
  const b = useNftBurn();
  const [search, setSearch] = useState("");

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? b.groups.filter((g) => g.title.toLowerCase().includes(q)) : b.groups;
  }, [b.groups, search]);
  const owned = useMemo(() => b.groups.reduce((s, g) => s + g.tokenIds.length, 0), [b.groups]);
  const left = MAX_BURN - b.total;

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl px-4 pb-[calc(env(safe-area-inset-bottom)+96px)] pt-6">
        <header className="mb-4 flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive/15 text-destructive">
            <Flame className="h-5 w-5" />
          </span>
          <h1 className="font-display text-2xl font-bold">{t("burn.title")}</h1>
          {b.owner && (
            <button
              type="button"
              onClick={() => void b.list.refetch()}
              disabled={b.list.isFetching}
              aria-label={t("burn.retry")}
              className="ml-auto inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border/50 bg-secondary/40 text-muted-foreground transition hover:text-foreground disabled:opacity-50"
            >
              <RefreshCw className={b.list.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            </button>
          )}
        </header>

        <BurnWalletPicker
          signers={b.signers}
          owner={b.owner}
          onPick={b.pickOwner}
          onConnect={b.connect}
        />

        {b.owner && (
          <div className="mt-4">
            {b.list.isLoading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : b.list.isError ? (
              <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span className="flex-1">{humanError(b.list.error)}</span>
                <button
                  type="button"
                  onClick={() => void b.list.refetch()}
                  className="font-semibold underline"
                >
                  {t("burn.retry")}
                </button>
              </div>
            ) : b.groups.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
                <PackageOpen className="h-8 w-8" />
                <span className="text-sm">{t("burn.empty")}</span>
              </div>
            ) : (
              <>
                <div className="mb-3 flex items-center gap-2 rounded-xl border border-border bg-secondary/40 px-3">
                  <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t("burn.search", { n: owned })}
                    className="min-h-11 w-full bg-transparent text-sm outline-none"
                  />
                </div>
                <div className="space-y-2">
                  {shown.map((g) => {
                    const q = b.qty[g.title] ?? 0;
                    return (
                      <BurnGroupRow
                        key={g.title}
                        group={g}
                        qty={q}
                        canAdd={left > 0 && q < g.tokenIds.length}
                        maxLabel={t("burn.max")}
                        onChange={b.changeQty}
                      />
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {b.total > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-2xl items-center gap-3 border-t border-border/70 bg-card/95 px-4 py-3 backdrop-blur-xl sm:rounded-t-2xl sm:border-x">
          <div className="min-w-0 flex-1">
            <div className="font-display text-lg font-bold tabular-nums">
              {b.total}{" "}
              <span className="text-sm font-medium text-muted-foreground">/ {MAX_BURN}</span>
            </div>
            <button
              type="button"
              onClick={b.clear}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              {t("burn.clear")}
            </button>
          </div>
          <button
            type="button"
            onClick={() => void b.openConfirm()}
            disabled={b.busy}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-destructive px-5 text-sm font-bold text-destructive-foreground transition hover:brightness-110 disabled:opacity-60"
          >
            {b.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flame className="h-4 w-4" />}
            {t("burn.burn_btn", { n: b.total })}
          </button>
        </div>
      )}

      <BurnConfirm
        key={b.confirmOpen ? "open" : "closed"}
        open={b.confirmOpen}
        count={b.total}
        wallet={b.owner ?? ""}
        busy={b.busy}
        needPin={b.needPin}
        needPwd={b.needPwd}
        onCancel={b.closeConfirm}
        onConfirm={(s) => void b.burn(s)}
      />
    </AppShell>
  );
}
