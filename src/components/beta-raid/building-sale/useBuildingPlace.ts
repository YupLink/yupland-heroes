// Данные установки постройки (lib/buildingSale): подсветка 37 клеток вокруг героя
// (bsale-spots) и установка подряд (bsale-place, useCellBatch). После — без F5:
// рюкзак, подсветка и карта.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { invalidateBackpack, invalidateRaidMap } from "@/lib/query";
import { serverErrorText } from "@/lib/serverErrorText";
import { getBuildingSpots } from "@/server/api/beta-raid/building-sale/bsale-spots";
import { placeBuilding } from "@/server/api/beta-raid/building-sale/bsale-place";
import { useCellBatch } from "@/components/beta-raid/dynamite/useCellBatch";

/** Ключ подсветки; префикс «beta-raid» — общий сброс при смене этажа. */
export const BUILDING_SPOTS_KEY = ["beta-raid-building-spots"] as const;

export function useBuildingPlace(stackKey: string | null) {
  const t = useT();
  const qc = useQueryClient();
  const cells = useQuery({
    queryKey: [...BUILDING_SPOTS_KEY, stackKey],
    queryFn: () => getBuildingSpots({ data: { stackKey: stackKey ?? "" } }),
    enabled: !!stackKey,
    staleTime: 0,
    retry: 1,
  });
  const batch = useCellBatch({
    run: (cell, op) =>
      placeBuilding({ data: { stackKey: stackKey ?? "", q: cell.q, r: cell.r, op } }),
    onEnd: ({ results, error }) => {
      const n = results.length;
      if (n > 0) toast.success(t("bsale.placed"));
      if (error) toast.error(serverErrorText(error, t));
      invalidateBackpack(qc);
      if (n > 0) invalidateRaidMap(qc);
      void qc.invalidateQueries({ queryKey: BUILDING_SPOTS_KEY });
    },
  });
  return { cells, batch };
}
