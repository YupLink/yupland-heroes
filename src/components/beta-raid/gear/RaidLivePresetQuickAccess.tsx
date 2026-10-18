import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { humanError } from "@/lib/humanError";
import { invalidateHeroQueries } from "@/lib/query";
import { applyGearPreset, listGearPresets } from "@/server/api/heroes-gear-presets";
import { GEAR_PRESETS_KEY } from "./GearPresets";
import { RaidPresetQuickAccess } from "./RaidPresetQuickAccess";

/** Live HUD entry: one tap closes the list and applies the saved set. */
export function RaidLivePresetQuickAccess({ ru, atCastle }: { ru: boolean; atCastle: boolean }) {
  const t = useT();
  const qc = useQueryClient();
  const presets = useQuery({ queryKey: GEAR_PRESETS_KEY, queryFn: () => listGearPresets() });
  const apply = useMutation({
    mutationFn: (id: string) => applyGearPreset({ data: { id } }),
    onSuccess: res => {
      const lost = res.missing + res.skipped;
      toast.success(lost > 0
        ? t("braid.preset_applied_partial", { name: res.name, n: res.equipped, lost })
        : t("braid.preset_applied", { name: res.name, n: res.equipped }));
      if (res.gear) qc.setQueryData(["my-hero-gear"], res.gear);
      invalidateHeroQueries(qc, ["my-energy", "beta-encounter", "beta-encounter-top", "yupland-status"]);
      void qc.invalidateQueries({ queryKey: GEAR_PRESETS_KEY, refetchType: "all" });
    },
    onError: (error: Error) => toast.error(humanError(error)),
  });

  return <RaidPresetQuickAccess
    ru={ru}
    atCastle={atCastle}
    presets={(presets.data ?? []).map(({ id, name }) => ({ id, name }))}
    status={presets.isPending ? "loading" : presets.isError ? "error" : "ready"}
    onRetry={() => { void presets.refetch(); }}
    onSelect={id => apply.mutate(id)}
    disabled={apply.isPending}
  />;
}
