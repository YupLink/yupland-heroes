// «Бросить динамит» из рюкзака (lib/dynamite): окно с сеткой 37 клеток в радиусе
// 3 от героя (DynamiteHexGrid) с подсветкой по правилам сервера (dynamite-cells):
// тап по зелёной — выбрать клетку (видно, какие клетки взорвутся: семь у красного,
// одна у синего); клеток можно натыкать несколько (до остатка стопки) — броски
// подряд одним нажатием (useCellBatch); по красной — под сеткой почему нельзя;
// «Бросить · ⚡100» — бросок (сначала энергия, потом взрыв — одной транзакцией на
// сервере), у нескольких — «Бросить ×N · ⚡…». «В руку» — динамит в главной руке, бросок
// тапом по карте до 3 клеток от героя (hand/handStore). После бросков окно закрывается:
// результат — на карте. Порталом в body (ResourceActionDialog),
// как окна посадки дерева и грибов: рюкзак живёт и в модалках.
import { useEffect } from "react";
import { Bomb, Hand, Loader2, Package, X } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { thumb } from "@/lib/image";
import { formatQty } from "@/lib/formatQty";
import { serverErrorText } from "@/lib/serverErrorText";
import { DYNAMITE_ENERGY, dynamiteKindOf, type DynamiteCell } from "@/lib/dynamite";
import type { BackpackStack } from "@/server/api/beta-raid/market-backpack";
import { ResourceActionDialog } from "@/components/beta-raid/ResourceActionDialog";
import { DynamiteHexGrid } from "./DynamiteHexGrid";
import { useDynamiteThrow } from "./useDynamiteThrow";
import { usePickedCells } from "./useCellBatch";
import { requestHand } from "@/components/beta-raid/hand/handStore";

export function DynamiteThrowPicker({
  stackKey,
  stack,
  onClose,
}: {
  stackKey: string;
  /** Стопка динамита в рюкзаке; null — кончился. */
  stack: BackpackStack | null;
  onClose: () => void;
}) {
  const t = useT();
  const { cells, batch } = useDynamiteThrow(stackKey, onClose);
  const list = cells.data?.cells ?? null;
  const center = cells.data?.center ?? null;
  const { picked, why, pick } = usePickedCells<DynamiteCell>(list, Math.floor(stack?.count ?? 0));
  const empty = !stack || stack.count < 1;
  useEffect(() => {
    if (empty && !batch.busy) onClose();
  }, [empty, batch.busy, onClose]);

  if (typeof document === "undefined" || empty) return null;
  const fire = () => {
    if (!picked.length || !center) return;
    batch.start(picked.map((c) => ({ q: center.q + c.dq, r: center.r + c.dr })));
  };
  const toHand = () => {
    if (!requestHand(stackKey)) toast(t("hand.on_map"));
    onClose();
  };
  const n = picked.length;
  const label =
    n > 1
      ? t("dynamite.throw_many", { k: n, n: DYNAMITE_ENERGY * n })
      : t("dynamite.throw_cost", { n: DYNAMITE_ENERGY });

  return (
    <ResourceActionDialog
      title={t("dynamite.title")}
      busy={batch.busy}
      onClose={onClose}
      overlayClassName="fixed inset-0 z-[140] flex items-end justify-center bg-black/75 sm:items-center sm:p-4"
      className="w-full max-w-xs rounded-t-2xl border border-border bg-background pb-[calc(env(safe-area-inset-bottom)+84px)] sm:rounded-2xl sm:pb-0"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h4 className="font-display text-sm font-bold">{t("dynamite.title")}</h4>
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
              <img src={thumb(stack.image, 80)} alt="" className="h-full w-full object-contain" />
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
          kind={dynamiteKindOf(stackKey) ?? "red"}
          disabled={batch.busy || cells.isLoading}
          onPick={pick}
        />
        {cells.isError ? (
          <p className="text-center text-xs text-destructive">
            {serverErrorText(cells.error, t, t("dynamite.cells_failed"))}
          </p>
        ) : (
          why && <p className="text-center text-xs text-destructive">{t(why)}</p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={toHand}
            disabled={batch.busy}
            className="flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-border px-3 text-sm font-semibold disabled:opacity-50"
          >
            <Hand className="h-4 w-4" />
            {t("land.hand")}
          </button>
          <button
            type="button"
            onClick={fire}
            disabled={!n || batch.busy}
            className="flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl bg-gold font-display text-sm font-bold text-gold-foreground disabled:opacity-50"
          >
            {batch.busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {n > 1 && `${batch.done}/${n}`}
              </>
            ) : (
              <>
                <Bomb className="h-4 w-4" />
                {label}
              </>
            )}
          </button>
        </div>
      </div>
    </ResourceActionDialog>
  );
}
