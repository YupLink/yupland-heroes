// Админ · Генератор миров (владелец, 06.10.2026): новая карта-черновик или
// бесконечный мир по логике живой карты — земли, озёра, декор по меткам,
// боссы и сундуки, города с ратушами, которые сразу живут сами. Живая карта не
// трогается; черновик открывается в редакторе карт кнопкой «Открыть».
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Globe, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { humanError } from "@/lib/humanError";
import { adminWorldCreate, adminWorldGrow, adminWorldList, adminWorldTerrains } from "@/api";
import type { WorldRow } from "@/server/api/beta-raid/worldgen/api";
import { WorldCreateForm } from "./WorldCreateForm";
import type { WorldDraft } from "./worldDraft";
import { WorldPlate } from "./WorldPlate";

const KEY = ["admin-worlds"] as const;

export function WorldgenPage() {
  const t = useT();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<WorldDraft>({
    name: t("worldgen.name_default"),
    seedText: "",
    kind: "map",
    size: 128,
    landPct: null,
    lands: null,
  });

  const listQ = useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<WorldRow[]> => adminWorldList(),
  });
  const rows = Array.isArray(listQ.data) ? listQ.data : [];
  // Земли живой карты — для выбора, из каких собрать мир.
  const terrainsQ = useQuery({
    queryKey: ["admin-world-terrains"],
    queryFn: () => adminWorldTerrains(),
    staleTime: 5 * 60_000,
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: KEY });

  const create = useMutation({
    mutationFn: (d: WorldDraft) => adminWorldCreate({ data: d }),
    onSuccess: (r) =>
      toast.success(t("worldgen.done", { towns: r.towns, halls: r.halls, cells: r.cells })),
    onError: (e: Error) => toast.error(humanError(e)),
    onSettled: refresh,
  });
  const grow = useMutation({
    mutationFn: (mapId: string) => adminWorldGrow({ data: { mapId } }),
    onSuccess: (r) => toast.success(t("worldgen.grown", { chunks: r.chunks })),
    onError: (e: Error) => toast.error(humanError(e)),
    onSettled: refresh,
  });

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-6 pb-24">
      <header className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl gradient-gold text-gold-foreground">
          <Globe className="h-5 w-5" />
        </span>
        <h1 className="flex-1 font-display text-2xl font-bold">{t("worldgen.title")}</h1>
      </header>

      <WorldCreateForm
        value={draft}
        terrains={terrainsQ.data ?? []}
        onChange={setDraft}
        onCreate={() => create.mutate(draft)}
        busy={create.isPending}
      />

      {listQ.isPending && (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-gold" />
        </div>
      )}
      {listQ.isError && (
        <p className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
          {humanError(listQ.error)}
        </p>
      )}
      {listQ.isSuccess && rows.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {t("worldgen.empty")}
        </div>
      )}
      <div className="space-y-2">
        {rows.map((r) => (
          <WorldPlate
            key={r.mapId}
            row={r}
            growing={grow.isPending && grow.variables === r.mapId}
            onGrow={() => grow.mutate(r.mapId)}
          />
        ))}
      </div>
    </div>
  );
}
