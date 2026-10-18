import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { myPackInventory, openPack } from "@/server/api/packs";
import { toast } from "sonner";
import { Package, EyeOff, Eye, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { fmtClaim } from "./shop-shared";
import { PackOpenModal } from "./PackOpenModal";

type PackInvItem = Awaited<ReturnType<typeof myPackInventory>>[number];

export { ClaimingOverlay } from "./ClaimingOverlay";

export { PackOpenModal } from "./PackOpenModal";

const HIDDEN_OPENED_PACKS_LS_KEY = "hidden_opened_packs_v1";
function readHiddenOpenedPacks(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const v = window.localStorage.getItem(HIDDEN_OPENED_PACKS_LS_KEY);
    if (!v) return new Set();
    return new Set(JSON.parse(v) as string[]);
  } catch {
    return new Set();
  }
}
function writeHiddenOpenedPacks(ids: Set<string>): void {
  try {
    window.localStorage.setItem(
      HIDDEN_OPENED_PACKS_LS_KEY,
      JSON.stringify([...ids])
    );
  } catch {
    /* приватный режим — игнор */
  }
}

export function PackInventorySection({
  packs,
  onChanged,
  only,
}: {
  packs: PackInvItem[];
  onChanged: () => void;
  only?: "unopened" | "opened";
}) {
  const t = useT();
  const unopened = packs.filter((p) => p.status === "unopened");
  const allOpened = packs.filter((p) => p.status === "opened");
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(() =>
    readHiddenOpenedPacks()
  );
  const [showHidden, setShowHidden] = useState(false);
  const opened = allOpened.filter((p) => !hidden.has(p.id));
  const hiddenOpened = allOpened.filter((p) => hidden.has(p.id));

  const hide = (id: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      next.add(id);
      writeHiddenOpenedPacks(next);
      return next;
    });
  };
  const unhide = (id: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      next.delete(id);
      writeHiddenOpenedPacks(next);
      return next;
    });
  };

  if (packs.length === 0) return null;

  return (
    <>
      {only !== "opened" && unopened.length > 0 && (
        <section className="mb-6 rounded-2xl border border-neon/40 bg-neon/5 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <Package className="h-4 w-4 text-neon" />
            {t("mynfts.packs_await_opening")} ({unopened.length})
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {unopened.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setOpeningId(p.id)}
                className="group flex flex-col overflow-hidden rounded-xl border border-neon/30 bg-card text-left transition hover:border-neon/60 hover:shadow-[0_0_20px_rgba(56,189,248,0.25)]"
              >
                <div className="relative aspect-square w-full overflow-hidden bg-secondary/40">
                  {p.packImage ? (
                    <img
                      src={p.packImage}
                      alt=""
                      className="h-full w-full object-cover transition group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                      <Package className="h-8 w-8" />
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-black/80 to-transparent p-2">
                    <span className="rounded-full bg-neon/90 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-black shadow">
                      {t("mynfts.open_pack_badge")}
                    </span>
                  </div>
                </div>
                <div className="p-2">
                  <div className="truncate text-sm font-medium">
                    {p.packName}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {new Date(p.obtainedAt).toLocaleDateString()}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {only !== "unopened" && opened.length > 0 && (
        <section className="mb-6 rounded-2xl border border-border bg-card/60 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Package className="h-4 w-4" />
            {t("mynfts.opened_packs")} ({opened.length})
          </div>
          <div className="space-y-1.5">
            {opened.slice(0, 6).map((p) => (
              <div
                key={p.id}
                className="flex items-start gap-3 rounded-lg border border-border/50 bg-background/40 p-2 text-xs"
              >
                <div className="aspect-square h-10 w-10 shrink-0 overflow-hidden rounded-md border border-border bg-background">
                  {p.packImage ? (
                    <img
                      src={p.packImage}
                      alt=""
                      className="h-full w-full object-cover opacity-70"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                      <Package className="h-4 w-4" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {p.packName}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {p.openedAt
                          ? new Date(p.openedAt).toLocaleString()
                          : "—"}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => hide(p.id)}
                      title={t("mynfts.hide")}
                      className="shrink-0 rounded-md p-1 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                    >
                      <EyeOff className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="mt-1.5 text-[11px]">
                    {p.resultKind === "nft" && (
                      <span className="inline-block rounded-full border border-neon/30 bg-neon/10 px-2 py-0.5 text-neon">
                        🖼 {p.resultNftTitle}
                      </span>
                    )}
                    {p.resultKind === "ft" && (
                      <span className="inline-block rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 text-gold">
                        💰 {p.resultFtAmount} {p.resultFtToken}
                      </span>
                    )}
                    {p.resultKind === "molodec" && (
                      <span className="inline-block rounded-full border border-border bg-secondary/40 px-2 py-0.5 text-muted-foreground">
                        🎉 {t("mynfts.molodec")}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {opened.length > 6 && (
              <div className="text-center text-[10px] text-muted-foreground">
                {t("mynfts.plus_more", { n: opened.length - 6 })}
              </div>
            )}
          </div>
        </section>
      )}

      {only !== "unopened" && hiddenOpened.length > 0 && (
        <section className="mb-6 rounded-2xl border border-border/40 bg-card/30 p-4">
          <button
            type="button"
            onClick={() => setShowHidden((v) => !v)}
            className="flex w-full items-center justify-between gap-2 text-sm font-medium text-muted-foreground transition hover:text-foreground"
          >
            <span className="flex items-center gap-2">
              <EyeOff className="h-4 w-4" />
              {t("mynfts.hidden_opened_packs")} ({hiddenOpened.length})
            </span>
            <span className="text-xs">{showHidden ? t("mynfts.collapse") : t("mynfts.show")}</span>
          </button>
          {showHidden && (
            <div className="mt-3 space-y-1.5">
              {hiddenOpened.map((p) => (
                <div
                  key={p.id}
                  className="flex items-start gap-3 rounded-lg border border-border/50 bg-background/40 p-2 text-xs"
                >
                  <div className="aspect-square h-10 w-10 shrink-0 overflow-hidden rounded-md border border-border bg-background">
                    {p.packImage ? (
                      <img
                        src={p.packImage}
                        alt=""
                        className="h-full w-full object-cover opacity-50"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-muted-foreground">
                        <Package className="h-4 w-4" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">
                          {p.packName}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {p.openedAt
                            ? new Date(p.openedAt).toLocaleString()
                            : "—"}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => unhide(p.id)}
                        title={t("mynfts.restore")}
                        className="shrink-0 rounded-md p-1 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="mt-1.5 text-[11px]">
                      {p.resultKind === "nft" && (
                        <span className="inline-block rounded-full border border-neon/30 bg-neon/10 px-2 py-0.5 text-neon">
                          🖼 {p.resultNftTitle}
                        </span>
                      )}
                      {p.resultKind === "ft" && (
                        <span className="inline-block rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 text-gold">
                          💰 {p.resultFtAmount} {p.resultFtToken}
                        </span>
                      )}
                      {p.resultKind === "molodec" && (
                        <span className="inline-block rounded-full border border-border bg-secondary/40 px-2 py-0.5 text-muted-foreground">
                          🎉 {t("mynfts.molodec")}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {openingId && (
        <PackOpenModal
          inventoryId={openingId}
          pack={packs.find((p) => p.id === openingId) ?? null}
          onClose={() => {
            setOpeningId(null);
            onChanged();
          }}
        />
      )}
    </>
  );
}
