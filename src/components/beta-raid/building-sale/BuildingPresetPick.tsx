// Товар «Постройка» в форме лавки построек (админ): выбор ШАБЛОНА постройки —
// настроенной на карте и сохранённой «В шаблон продажи» (bsale-preset). Вместо
// второй копии всех редакторов режима бога (владелец 05.11: «в админке каша»).
// Товар первого шага (облик и настройка в самом товаре) показан как есть.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { thumb } from "@/lib/image";
import { humanError } from "@/lib/humanError";
import type { MarketDraft } from "@/lib/marketItem";
import {
  deleteBuildingPreset,
  listBuildingPresets,
  type BuildingPreset,
} from "@/server/api/beta-raid/building-sale/bsale-preset";

export const PRESETS_KEY = ["bsale-presets"] as const;

function Tile({ p, chosen, onPick }: { p: BuildingPreset; chosen: boolean; onPick: () => void }) {
  const qc = useQueryClient();
  const [sure, setSure] = useState(false);
  const del = useMutation({
    mutationFn: () => deleteBuildingPreset({ data: { id: p.id } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: PRESETS_KEY }),
    onError: (e: Error) => toast.error(humanError(e)),
  });
  return (
    <div
      className={cn(
        "relative rounded-xl border p-1.5",
        chosen ? "border-gold bg-gold/10" : "border-border",
      )}
    >
      <button type="button" onClick={onPick} className="flex w-full flex-col items-center gap-1">
        <div className="h-14 w-14 overflow-hidden rounded-lg bg-secondary/40">
          {p.image && (
            <img
              src={thumb(p.image, 112, "black")}
              alt=""
              className="h-full w-full object-contain"
            />
          )}
        </div>
        <span className="w-full truncate text-center text-[11px] font-semibold">{p.name}</span>
      </button>
      <button
        type="button"
        aria-label="Удалить шаблон"
        onClick={() => (sure ? del.mutate() : setSure(true))}
        className={cn(
          "absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full",
          sure ? "bg-destructive text-white" : "text-muted-foreground",
        )}
      >
        {del.isPending ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : sure ? (
          <Check className="h-3 w-3" />
        ) : (
          <Trash2 className="h-3 w-3" />
        )}
      </button>
    </div>
  );
}

export function BuildingPresetPick({
  draft,
  set,
}: {
  draft: MarketDraft;
  set: (patch: Partial<MarketDraft>) => void;
}) {
  const list = useQuery({
    queryKey: PRESETS_KEY,
    queryFn: () => listBuildingPresets(),
    staleTime: 10_000,
  });
  const chosen = draft.building?.presetId ?? null;
  const legacy = !!draft.id && !chosen;
  const pick = (p: BuildingPreset) =>
    set({
      refId: p.buildingId,
      name: p.name,
      image: p.image,
      building: { skinId: null, config: null, presetId: p.id },
    });

  if (list.isLoading) {
    return (
      <div className="flex justify-center py-3">
        <Loader2 className="h-4 w-4 animate-spin text-gold" />
      </div>
    );
  }
  const presets = list.data ?? [];
  return (
    <div className="space-y-2">
      {legacy && (
        <div className="flex items-center gap-2 rounded-xl border border-gold bg-gold/10 p-1.5">
          {draft.image && (
            <img src={thumb(draft.image, 64, "black")} alt="" className="h-8 w-8 object-contain" />
          )}
          <span className="truncate text-xs font-semibold">{draft.name}</span>
        </div>
      )}
      {presets.length === 0 ? (
        <p className="text-center text-[11px] text-muted-foreground">
          Шаблонов нет · режим бога → постройка → «В шаблон продажи»
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-1.5">
          {presets.map((p) => (
            <Tile key={p.id} p={p} chosen={p.id === chosen} onPick={() => pick(p)} />
          ))}
        </div>
      )}
    </div>
  );
}
