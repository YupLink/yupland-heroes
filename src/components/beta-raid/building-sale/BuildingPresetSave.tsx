// «В шаблон продажи» в окне клетки режима бога: настроенную здесь постройку
// (облик, поведение, грядка, витрина плавильни…) сохранить шаблоном для лавки
// построек (bsale-preset). Та же клетка ещё раз — шаблон обновится.
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Layers, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { humanError } from "@/lib/humanError";
import { SALE_BANNED_EFFECTS } from "@/lib/buildingSale";
import { saveBuildingPreset } from "@/server/api/beta-raid/building-sale/bsale-preset";
import { PRESETS_KEY } from "./BuildingPresetPick";

export function BuildingPresetSave({
  q,
  r,
  effect,
  name,
}: {
  q: number;
  r: number;
  effect: string | null;
  name: string;
}) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const save = useMutation({
    mutationFn: () => saveBuildingPreset({ data: { q, r, name: title.trim() } }),
    onSuccess: (res) => {
      toast.success(`Шаблон «${res.name}» сохранён`);
      setTitle("");
      void qc.invalidateQueries({ queryKey: PRESETS_KEY });
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });
  if (effect && SALE_BANNED_EFFECTS.includes(effect)) return null;
  return (
    <div className="mt-2 flex gap-1.5">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={name}
        maxLength={80}
        className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
      />
      <button
        type="button"
        onClick={() => save.mutate()}
        disabled={save.isPending}
        className="flex shrink-0 items-center gap-1 rounded-lg border border-gold/40 bg-gold/10 px-2.5 py-1.5 text-[11px] font-bold text-gold disabled:opacity-50"
      >
        {save.isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Layers className="h-3.5 w-3.5" />
        )}
        В шаблон продажи
      </button>
    </div>
  );
}
