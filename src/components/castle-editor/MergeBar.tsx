// Полоска режима «Объединить»: либо набор клеток → кнопка «Объединить · N»,
// либо выбранный блок → масштаб картинки «−  120 %  +» и «Разъединить».
// Одна и та же полоска нужна и режиму бога — держим её без привязки к замку.
import { Minus, Plus, Unlink } from "lucide-react";
import {
  ICON_SCALE_MAX,
  ICON_SCALE_MIN,
  MERGE_MAX_CELLS,
  MERGE_MIN_CELLS,
  clampIconScale,
  iconScaleLabel,
} from "@/lib/mergeScale";

/** Подписи полоски: замок — по-русски (дефолт), режим бога даёт свои ru/en. */
export type MergeLabels = {
  pickHint: string;
  mergeBtn: string;
  blockHint: string;
  block: string;
  cellsShort: string;
  smaller: string;
  bigger: string;
  unmerge: string;
};

const RU: MergeLabels = {
  pickHint: `Тапай ${MERGE_MIN_CELLS}–${MERGE_MAX_CELLS} соседних клеток, потом —`,
  mergeBtn: "Объединить",
  blockHint: "Тап по готовому блоку — масштаб и разъединение.",
  block: "Блок",
  cellsShort: "кл.",
  smaller: "Меньше на 5 %",
  bigger: "Больше на 5 %",
  unmerge: "Разъединить",
};

export function MergeBar({
  selectedCount,
  onMerge,
  group,
  onScale,
  onUnmerge,
  labels,
}: {
  selectedCount: number;
  onMerge: () => void;
  /** Выбранный блок: сколько клеток и текущий масштаб; null — блок не выбран. */
  group: { cells: number; scale: number | null } | null;
  onScale: (dir: 1 | -1) => void;
  onUnmerge: () => void;
  labels?: Partial<MergeLabels>;
}) {
  const L = { ...RU, ...labels };
  if (group) {
    const scale = clampIconScale(group.scale);
    return (
      <div className="flex flex-wrap items-center gap-2 px-1 py-1 text-[11px] text-muted-foreground">
        <span>
          {L.block} · {group.cells} {L.cellsShort}
        </span>
        <span className="inline-flex items-center overflow-hidden rounded-lg ring-1 ring-violet-400/60">
          <button
            type="button"
            title={L.smaller}
            disabled={scale <= ICON_SCALE_MIN}
            onClick={() => onScale(-1)}
            className="grid h-8 w-9 place-items-center bg-violet-500/20 text-violet-200 disabled:opacity-40"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="min-w-[52px] bg-violet-500/10 text-center font-semibold tabular-nums text-violet-100">
            {iconScaleLabel(scale)}
          </span>
          <button
            type="button"
            title={L.bigger}
            disabled={scale >= ICON_SCALE_MAX}
            onClick={() => onScale(1)}
            className="grid h-8 w-9 place-items-center bg-violet-500/20 text-violet-200 disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </span>
        <button
          type="button"
          onClick={onUnmerge}
          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 font-semibold text-rose-300 ring-1 ring-rose-400/50"
        >
          <Unlink className="h-3.5 w-3.5" />
          {L.unmerge}
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2 px-1 py-1 text-[11px] text-muted-foreground">
      <span>{L.pickHint}</span>
      <button
        type="button"
        disabled={selectedCount < MERGE_MIN_CELLS}
        onClick={onMerge}
        className="rounded-lg bg-violet-500/20 px-3 py-1.5 font-semibold text-violet-200 ring-1 ring-violet-400/60 disabled:opacity-40"
      >
        {L.mergeBtn} · {selectedCount}
      </button>
      <span className="text-[10px]">{L.blockHint}</span>
    </div>
  );
}
