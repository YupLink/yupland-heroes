// «Поставить постройку» из рюкзака (lib/buildingSale): окно с сеткой 37 клеток в
// радиусе 3 от героя (та же сетка, что у жилы) с подсветкой по правилам сервера
// (bsale-spots). Тап по зелёной — выбор, «Поставить» — установка; по красной —
// под сеткой почему нельзя. Кончилась стопка — окно закрывается само.
import { useEffect } from "react";
import { Hammer, Loader2, Package, X } from "lucide-react";
import { useT } from "@/lib/i18n";
import { thumb } from "@/lib/image";
import { formatQty } from "@/lib/formatQty";
import { serverErrorText } from "@/lib/serverErrorText";
import type { BackpackStack } from "@/server/api/beta-raid/market-backpack";
import type { BuildingCell } from "@/server/api/beta-raid/building-sale/bsale-spots";
import { ResourceActionDialog } from "@/components/beta-raid/ResourceActionDialog";
import { DynamiteHexGrid } from "@/components/beta-raid/dynamite/DynamiteHexGrid";
import { usePickedCells } from "@/components/beta-raid/dynamite/useCellBatch";
import { useBuildingPlace } from "./useBuildingPlace";

export function BuildingPlacePicker({
  stackKey,
  stack,
  onClose,
}: {
  stackKey: string;
  /** Стопка постройки в рюкзаке; null — кончилась. */
  stack: BackpackStack | null;
  onClose: () => void;
}) {
  const t = useT();
  const { cells, batch } = useBuildingPlace(stackKey);
  const list = cells.data?.cells ?? null;
  const center = cells.data?.center ?? null;
  // Одна клетка за раз: постройка — штучная, не пачка клеток.
  const { picked, why, pick } = usePickedCells<BuildingCell>(list, Math.min(1, stack?.count ?? 0));
  const empty = !stack || stack.count < 1;
  useEffect(() => {
    if (empty && !batch.busy) onClose();
  }, [empty, batch.busy, onClose]);

  if (typeof document === "undefined" || empty) return null;
  const go = () => {
    if (!picked.length || !center) return;
    batch.start(picked.map((c) => ({ q: center.q + c.dq, r: center.r + c.dr })));
  };

  return (
    <ResourceActionDialog
      title={t("bsale.title")}
      busy={batch.busy}
      onClose={onClose}
      overlayClassName="fixed inset-0 z-[140] flex items-end justify-center bg-black/75 sm:items-center sm:p-4"
      className="w-full max-w-xs rounded-t-2xl border border-border bg-background pb-[calc(env(safe-area-inset-bottom)+84px)] sm:rounded-2xl sm:pb-0"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h4 className="font-display text-sm font-bold">{t("bsale.title")}</h4>
        <button
          type="button"
          onClick={onClose}
          disabled={batch.busy}
          aria-label={t("common.close")}
          className="grid h-8 w-8 place-items-center rounded-full border border-border text-muted-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="space-y-3 p-4">
        <div className="flex items-center gap-2">
          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-border bg-secondary/40">
            {stack.image ? (
              <img src={thumb(stack.image, 80)} alt="" className="h-full w-full object-cover" />
            ) : (
              <Package className="m-2.5 h-5 w-5 text-gold/40" />
            )}
          </div>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{stack.name}</span>
          <span className="text-xs font-bold tabular-nums text-muted-foreground">
            ×{formatQty(stack.count)}
          </span>
        </div>
        <DynamiteHexGrid
          cells={list}
          picked={picked}
          kind="blue"
          disabled={batch.busy || cells.isLoading}
          onPick={(c) => pick(c as BuildingCell)}
        />
        {cells.isError ? (
          <p className="text-center text-xs text-destructive">
            {serverErrorText(cells.error, t, t("bsale.cells_failed"))}
          </p>
        ) : (
          why && <p className="text-center text-xs text-destructive">{t(why)}</p>
        )}
        <button
          type="button"
          onClick={go}
          disabled={!picked.length || batch.busy}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gold font-display text-sm font-bold text-gold-foreground disabled:opacity-50"
        >
          {batch.busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Hammer className="h-4 w-4" />
              {t("bsale.put")}
            </>
          )}
        </button>
      </div>
    </ResourceActionDialog>
  );
}
