// Палитра интерьера: вкладки слоёв → ассеты слоя (свои картинки), «Добавить»,
// «Ластик» (стирает выбранный слой) и режим «Объединить» (2–10 клеток в одну).
// Удаление ассета — в модалке правки (карандаш), чтобы на телефоне палец не
// попадал в крестик вместо плитки.
import { Combine, Eraser, Pencil, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { thumb } from "@/lib/image";
import { MergeBar } from "./MergeBar";
import { CASTLE_KINDS, KIND_LABEL, type Asset, type Brush, type CastleKind } from "./types";

const HEX_CLIP = "polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%)";

export function CastlePalette({
  assets,
  kind,
  onKind,
  brush,
  onBrush,
  mergeMode,
  onMergeMode,
  selectedCount,
  onMerge,
  group,
  onScale,
  onUnmerge,
  onAdd,
  onEdit,
}: {
  assets: Asset[];
  kind: CastleKind;
  onKind: (k: CastleKind) => void;
  /** null — кисть не выбрана: тап по клетке ничего не делает. */
  brush: Brush | null;
  onBrush: (b: Brush | null) => void;
  mergeMode: boolean;
  onMergeMode: (on: boolean) => void;
  selectedCount: number;
  onMerge: () => void;
  /** Выбранный блок в режиме объединения (масштаб/разъединение). */
  group: { cells: number; scale: number | null } | null;
  onScale: (dir: 1 | -1) => void;
  onUnmerge: () => void;
  onAdd: () => void;
  onEdit: (a: Asset) => void;
}) {
  const list = assets.filter((a) => a.kind === kind);
  const isEraser = !mergeMode && brush?.kind === kind && brush.assetId === null;
  const clip = kind === "terrain" ? HEX_CLIP : undefined;

  return (
    <section className="rounded-2xl border border-border bg-card p-1.5">
      {/* Вкладки слоёв */}
      <div className="mb-1.5 flex flex-wrap gap-1 px-1">
        {CASTLE_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              onKind(k);
              onMergeMode(false);
            }}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-semibold",
              kind === k && !mergeMode
                ? "bg-gold/15 text-gold ring-1 ring-gold/60"
                : "bg-secondary/40 text-muted-foreground",
            )}
          >
            {KIND_LABEL[k]}
          </button>
        ))}
        {/* Объединить — отдельный режим: клик по клеткам выделяет, потом кнопка */}
        <button
          type="button"
          onClick={() => onMergeMode(!mergeMode)}
          title="Объединить 2–10 соседних клеток в одну"
          className={cn(
            "ml-auto inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold",
            mergeMode
              ? "bg-violet-500/20 text-violet-300 ring-1 ring-violet-400/60"
              : "bg-secondary/40 text-muted-foreground",
          )}
        >
          <Combine className="h-3.5 w-3.5" />
          Объединить
        </button>
      </div>

      {mergeMode ? (
        <MergeBar
          selectedCount={selectedCount}
          onMerge={onMerge}
          group={group}
          onScale={onScale}
          onUnmerge={onUnmerge}
        />
      ) : (
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          <button
            type="button"
            onClick={onAdd}
            title={`Добавить — ${KIND_LABEL[kind].toLowerCase()} (своя картинка)`}
            className="flex flex-none flex-col items-center gap-0.5 rounded p-0.5 hover:bg-secondary/40"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded border-2 border-dashed border-gold/50">
              <Plus className="h-4 w-4 text-gold" />
            </div>
            <span className="text-[9px] text-gold">Добавить</span>
          </button>

          <button
            type="button"
            onClick={() => onBrush(isEraser ? null : { kind, assetId: null })}
            title={`Ластик — стереть слой «${KIND_LABEL[kind]}»`}
            className={cn(
              "flex flex-none flex-col items-center gap-0.5 rounded p-0.5",
              isEraser ? "bg-destructive/10 ring-2 ring-destructive/60" : "hover:bg-secondary/40",
            )}
          >
            <div className="grid h-11 w-11 place-items-center rounded border border-border">
              <Eraser className="h-4 w-4 text-muted-foreground" />
            </div>
            <span className="text-[9px] text-muted-foreground">Ластик</span>
          </button>

          {list.map((a) => {
            const isSelected = brush?.kind === kind && brush.assetId === a.id;
            return (
              <div key={a.id} className="group relative flex flex-none flex-col items-center p-0.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit(a);
                  }}
                  title="Редактировать / удалить"
                  className={cn(
                    "absolute -left-1 -top-1 z-10 h-6 w-6 items-center justify-center rounded-full bg-black/80 text-white",
                    isSelected ? "flex" : "hidden group-hover:flex",
                  )}
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => onBrush({ kind, assetId: a.id })}
                  title={a.name}
                  className={cn(
                    "flex flex-none flex-col items-center gap-0.5 rounded p-0.5",
                    isSelected ? "bg-gold/10 ring-2 ring-gold" : "hover:bg-secondary/40",
                  )}
                >
                  {a.image_url ? (
                    <img
                      src={thumb(a.image_url, 96)}
                      alt=""
                      className="h-11 w-11 object-contain"
                      style={clip ? { clipPath: clip } : undefined}
                    />
                  ) : (
                    <div className="h-11 w-11 rounded-md bg-secondary" />
                  )}
                  <span className="max-w-[64px] truncate text-[9px] text-muted-foreground">
                    {a.name}
                  </span>
                </button>
              </div>
            );
          })}
          {list.length === 0 && (
            <span className="self-center px-2 text-[11px] text-muted-foreground">
              пока пусто — «Добавить» и загрузи свою картинку
            </span>
          )}
        </div>
      )}
    </section>
  );
}
