// Данные укладки земли (lib/landPlace): подсветка 37 клеток вокруг героя
// (land-cells) и укладка подряд (land-place, useCellBatch) — из окна рюкзака
// сразу несколько клеток, из руки на карте — по одной на тап.
//
// После укладки — без F5: рюкзак, энергия (перестройка), подсветка и карта.
// Своя карта перечитывается сразу, у остальных то же приходит дельтой.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { invalidateBackpack, invalidateRaidMap } from "@/lib/query";
import { serverErrorText } from "@/lib/serverErrorText";
import { ENERGY_KEY } from "@/lib/hooks/useEnergy";
import { getLandCells } from "@/server/api/beta-raid/land/land-cells";
import { placeLand } from "@/server/api/beta-raid/land/land-place";
import { useCellBatch } from "@/components/beta-raid/dynamite/useCellBatch";

/** Ключ подсветки; префикс «beta-raid» — общий сброс при смене этажа. */
export const LAND_CELLS_KEY = ["beta-raid-land-cells"] as const;

/**
 * `at` — клетка героя, когда подсветка должна идти за ним (земля в руке);
 * окну рюкзака её не нужно: герой там стоит на месте.
 */
export function useLandPlace(stackKey: string | null, at: { q: number; r: number } | null = null) {
  const t = useT();
  const qc = useQueryClient();
  const cells = useQuery({
    queryKey: [...LAND_CELLS_KEY, stackKey, at?.q ?? null, at?.r ?? null],
    queryFn: () => getLandCells({ data: { stackKey: stackKey ?? "" } }),
    enabled: !!stackKey,
    staleTime: 0,
    retry: 1,
  });
  const batch = useCellBatch({
    run: (cell, op) => placeLand({ data: { stackKey: stackKey ?? "", q: cell.q, r: cell.r, op } }),
    onEnd: ({ results, all, error }) => {
      const n = results.length;
      if (n > 0) toast.success(n === 1 ? t("land.placed") : t("land.placed_n", { n }));
      if (error) {
        const why = serverErrorText(error, t);
        toast.error(n > 0 ? `${t("land.partial", { done: n, all })}: ${why}` : why);
      }
      invalidateBackpack(qc);
      if (n > 0) invalidateRaidMap(qc);
      void qc.invalidateQueries({ queryKey: ENERGY_KEY, refetchType: "all" });
      void qc.invalidateQueries({ queryKey: LAND_CELLS_KEY });
    },
  });
  return { cells, batch };
}
