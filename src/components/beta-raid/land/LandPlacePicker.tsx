// «Положить землю» из рюкзака (lib/landPlace): окно с сеткой 61 клетки в
// радиусе LAND_RADIUS от героя (та же сетка, что у динамита) с подсветкой по правилам
// сервера (land-cells). Зелёные можно натыкать сколько угодно (до остатка
// стопки) и положить одним нажатием; ⚡ на клетке — перестройка другой местности
// за энергию; по красной — под сеткой почему нельзя. «В руку» — земля в главной
// руке, клетки кладутся тапом по карте (hand/handStore). Окно остаётся открытым;
// кончилась стопка — закрывается само.
import { useEffect } from "react";
import { Hand, Layers, Loader2, Package, X, Zap } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { useCurrentWorldArt } from "../world-art/useCurrentWorldArt";
import { WorldArtThumbnail } from "../world-art/WorldArtThumbnail";
import { formatQty } from "@/lib/formatQty";
import { serverErrorText } from "@/lib/serverErrorText";
import { LAND_RADIUS, landOfStack, type LandCell } from "@/lib/landPlace";
import type { BackpackStack } from "@/server/api/beta-raid/market-backpack";
import { ResourceActionDialog } from "@/components/beta-raid/ResourceActionDialog";
import { DynamiteHexGrid } from "@/components/beta-raid/dynamite/DynamiteHexGrid";
import { usePickedCells } from "@/components/beta-raid/dynamite/useCellBatch";
import { useLandPlace } from "./useLandPlace";
import { requestHand } from "@/components/beta-raid/hand/handStore";

/** Надпись кнопки: сколько клеток и сколько энергии на перестройку. */
function placeLabel(t: ReturnType<typeof useT>, n: number, energy: number): string {
  if (n <= 1 && energy === 0) return t("land.place");
  const base = t("land.place_n", { n });
  return energy > 0 ? `${base} · ⚡${energy}` : base;
}

export function LandPlacePicker({
  stackKey,
  stack,
  onClose,
}: {
  stackKey: string;
  /** Стопка земли в рюкзаке; null — кончилась. */
  stack: BackpackStack | null;
  onClose: () => void;
}) {
  const t = useT();
  const art = useCurrentWorldArt();
  const { cells, batch } = useLandPlace(stackKey);
  const list = cells.data?.cells ?? null;
  const center = cells.data?.center ?? null;
  const { picked, why, pick } = usePickedCells<LandCell>(list, Math.floor(stack?.count ?? 0));
  const empty = !stack || stack.count < 1;
  useEffect(() => {
    if (empty && !batch.busy) onClose();
  }, [empty, batch.busy, onClose]);

  if (typeof document === "undefined" || empty) return null;
  const energy = picked.reduce((sum, c) => sum + c.cost, 0);
  const go = () => {
    if (!picked.length || !center) return;
    batch.start(picked.map((c) => ({ q: center.q + c.dq, r: center.r + c.dr })));
  };
  const toHand = () => {
    if (!requestHand(stackKey)) toast(t("land.hand_on_map"));
    onClose();
  };

  return (
    <ResourceActionDialog
      title={t("land.title")}
      busy={batch.busy}
      onClose={onClose}
      overlayClassName="fixed inset-0 z-[140] flex items-end justify-center bg-black/75 sm:items-center sm:p-4"
      className="w-full max-w-xs rounded-t-2xl border border-border bg-background pb-[calc(env(safe-area-inset-bottom)+84px)] sm:rounded-2xl sm:pb-0"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h4 className="font-display text-sm font-bold">{t("land.title")}</h4>
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
              <WorldArtThumbnail art={art} kind="terrain" id={landOfStack(stackKey) ?? ""} original={stack.image} width={80} className="h-full w-full object-cover" />
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
          radius={LAND_RADIUS}
          disabled={batch.busy || cells.isLoading}
          onPick={(c) => pick(c as LandCell)}
          markOf={(c) => ((c as LandCell).ok && (c as LandCell).cost > 0 ? Zap : null)}
        />
        {cells.isError ? (
          <p className="text-center text-xs text-destructive">
            {serverErrorText(cells.error, t, t("land.cells_failed"))}
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
            onClick={go}
            disabled={!picked.length || batch.busy}
            className="flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl bg-gold font-display text-sm font-bold text-gold-foreground disabled:opacity-50"
          >
            {batch.busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {picked.length > 1 && `${batch.done}/${picked.length}`}
              </>
            ) : (
              <>
                <Layers className="h-4 w-4" />
                {placeLabel(t, picked.length, energy)}
              </>
            )}
          </button>
        </div>
      </div>
    </ResourceActionDialog>
  );
}
