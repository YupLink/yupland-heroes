// Данные укладки жилы (lib/veinPlace): подсветка 37 клеток вокруг героя
// (vein-spots) и укладка подряд (vein-place, useCellBatch) — из окна рюкзака
// сразу несколько клеток, из руки на карте — по отметкам и тапу.
//
// После укладки — без F5: рюкзак, подсветка и карта. Своя карта перечитывается
// сразу, у остальных та же жила приходит дельтой (CellPatch.vein).
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { invalidateBackpack, invalidateRaidMap } from "@/lib/query";
import { serverErrorText } from "@/lib/serverErrorText";
import { getVeinSpots } from "@/server/api/beta-raid/vein/vein-spots";
import { placeVein } from "@/server/api/beta-raid/vein/vein-place";
import { useCellBatch } from "@/components/beta-raid/dynamite/useCellBatch";

/** Ключ подсветки; префикс «beta-raid» — общий сброс при смене этажа. */
export const VEIN_SPOTS_KEY = ["beta-raid-vein-spots"] as const;

/**
 * `at` — клетка героя, когда подсветка должна идти за ним (жила в руке);
 * окну рюкзака её не нужно: герой там стоит на месте.
 */
export function useVeinPlace(stackKey: string | null, at: { q: number; r: number } | null = null) {
  const t = useT();
  const qc = useQueryClient();
  const cells = useQuery({
    queryKey: [...VEIN_SPOTS_KEY, stackKey, at?.q ?? null, at?.r ?? null],
    queryFn: () => getVeinSpots({ data: { stackKey: stackKey ?? "" } }),
    enabled: !!stackKey,
    staleTime: 0,
    retry: 1,
  });
  const batch = useCellBatch({
    run: (cell, op) => placeVein({ data: { stackKey: stackKey ?? "", q: cell.q, r: cell.r, op } }),
    onEnd: ({ results, all, error }) => {
      const n = results.length;
      if (n > 0) toast.success(n === 1 ? t("vein.placed") : t("vein.placed_n", { n }));
      if (error) {
        const why = serverErrorText(error, t);
        toast.error(n > 0 ? `${t("vein.partial", { done: n, all })}: ${why}` : why);
      }
      invalidateBackpack(qc);
      if (n > 0) invalidateRaidMap(qc);
      void qc.invalidateQueries({ queryKey: VEIN_SPOTS_KEY });
    },
  });
  return { cells, batch };
}
