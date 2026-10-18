// Расширить края карты: дорисовать N колец из выбранного типа местности.
//
// Живёт в панели админа над картой (AdminRaidRestore), но вынесен в свой
// файл — правило проекта ≤250 строк на файл, у той панели и так тесно.
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Waves } from "lucide-react";
import { toast } from "sonner";
import { humanError } from "@/lib/humanError";
import { adminExpandMapEdges } from "@/server/api/beta-raid/admin-map-expand";
import { useAssets } from "./AdminCellPalette";

export function AdminMapExpand() {
  const [rings, setRings] = useState(2);
  const [terrainId, setTerrainId] = useState<string>("");
  const q = useAssets("terrain");
  const items = (q.data ?? []).filter((i) => i.active);
  const first = items[0]?.id ?? "";
  const effectiveTerrain = terrainId || first;
  const expand = useMutation({
    mutationFn: () => adminExpandMapEdges({ data: { rings, terrainId: effectiveTerrain } }),
    onSuccess: (r) => {
      toast.success(`Кайма: +${r.added} клеток`);
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });
  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-border px-1.5 py-1">
      <Waves className="h-3.5 w-3.5 text-muted-foreground" />
      <input
        type="number"
        min={1}
        max={10}
        value={rings}
        onChange={(e) => setRings(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
        className="w-9 rounded bg-secondary/50 px-1 py-0.5 text-center text-[11px] tabular-nums outline-none"
        title="Сколько колец добавить"
      />
      <select
        value={effectiveTerrain}
        onChange={(e) => setTerrainId(e.target.value)}
        className="max-w-[9rem] truncate rounded bg-secondary/50 px-1 py-0.5 text-[11px] outline-none"
        title="Тип местности для новых клеток"
      >
        {items.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => expand.mutate()}
        disabled={!effectiveTerrain || expand.isPending}
        title="Дорисовать выбранное число колец вокруг существующих клеток"
        className="rounded-md bg-secondary px-2 py-0.5 text-[11px] font-bold transition enabled:hover:bg-secondary/70 disabled:opacity-40"
      >
        {expand.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Кайма"}
      </button>
    </div>
  );
}
