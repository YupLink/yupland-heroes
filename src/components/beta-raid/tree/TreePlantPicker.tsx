// «Посадить дерево» из рюкзака (lib/treePlant): своя клетка и шесть соседних в
// сетке гексов, как у грибов и сундуков (PlaceDirGrid), с подсветкой по правилам
// сервера — зелёная можно, красная нельзя (tree-plant-cells). Тап по зелёной
// сажает дерево за TREE_PLANT_ENERGY энергии; по красной — под сеткой почему.
// Посадил — подсветка перечитывается, окно открыто, пока в стопке есть деревья;
// стопка кончилась — окно закрывается само. Порталом в body (ResourceActionDialog),
// как окна сундуков и грибов: рюкзак живёт и в модалках.
import { useEffect, useState } from "react";
import { Package, X } from "lucide-react";
import { useLang, useT } from "@/lib/i18n";
import { thumb } from "@/lib/image";
import { serverErrorText } from "@/lib/serverErrorText";
import { formatQty } from "@/lib/formatQty";
import { TREE_PLANT_ENERGY, plantTextKey, treeNameOr } from "@/lib/treePlant";
import type { BackpackStack } from "@/server/api/beta-raid/market-backpack";
import { ResourceActionDialog } from "@/components/beta-raid/ResourceActionDialog";
import { PlaceDirGrid, type PlaceTone } from "@/components/beta-raid/chest/PlaceDirGrid";
import { useTreePlant } from "./useTreePlant";

export function TreePlantPicker({
  stackKey,
  stack,
  onClose,
}: {
  stackKey: string;
  /** Стопка деревьев в рюкзаке; null — кончились. */
  stack: BackpackStack | null;
  onClose: () => void;
}) {
  const t = useT();
  const lang = useLang();
  const { cells, plant } = useTreePlant(stackKey);
  // Почему нельзя — ключ словаря красной клетки, которую тронули.
  const [why, setWhy] = useState<string | null>(null);
  const empty = !stack || stack.count < 1;
  // Камень (rock:) — свои слова: «Поставить камень», а не «Посадить дерево».
  const tk = (key: string) => plantTextKey(key, stackKey);
  useEffect(() => {
    if (empty && !plant.isPending) onClose();
  }, [empty, plant.isPending, onClose]);

  if (typeof document === "undefined" || empty) return null;
  const list = cells.data ?? null;
  const tones: PlaceTone[] = list ? list.map((c) => (c.ok ? "ok" : "bad")) : [];
  const busyAt = plant.isPending ? plant.variables : null;
  const pick = (i: number) => {
    const c = list?.[i];
    if (c && !c.ok) {
      setWhy(c.reason);
      return;
    }
    setWhy(null);
    plant.mutate(i);
  };

  return (
    <ResourceActionDialog
      title={t(tk("tree.plant_title"))}
      busy={plant.isPending}
      onClose={onClose}
      overlayClassName="fixed inset-0 z-[140] flex items-end justify-center bg-black/75 sm:items-center sm:p-4"
      className="w-full max-w-xs rounded-t-2xl border border-border bg-background pb-[calc(env(safe-area-inset-bottom)+84px)] sm:rounded-2xl sm:pb-0"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h4 className="font-display text-sm font-bold">{t(tk("tree.plant_title"))}</h4>
        <button
          type="button"
          onClick={onClose}
          disabled={plant.isPending}
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
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">
            {treeNameOr(stackKey, stack.name, lang)}
          </span>
          <span className="text-xs font-bold tabular-nums text-muted-foreground">
            ×{formatQty(stack.count)}
          </span>
        </div>
        <p className="text-center text-xs font-semibold text-gold">
          {t(tk("tree.plant_cost"), { n: TREE_PLANT_ENERGY })}
        </p>
        <PlaceDirGrid
          selected={-1}
          tones={tones}
          busyAt={busyAt}
          disabled={plant.isPending || cells.isLoading}
          onPick={pick}
        />
        {cells.isError ? (
          <p className="text-center text-xs text-destructive">
            {serverErrorText(
              cells.error && new Error(tk(cells.error.message)),
              t,
              t("tree.cells_failed"),
            )}
          </p>
        ) : (
          why && <p className="text-center text-xs text-destructive">{t(tk(why))}</p>
        )}
      </div>
    </ResourceActionDialog>
  );
}
