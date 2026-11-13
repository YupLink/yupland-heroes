// Данные окна «Посадить дерево» (lib/treePlant): подсветка семи клеток вокруг
// героя (tree-plant-cells) и посадка (tree-plant) с ключом нажатия. Ключ
// меняется после посадки и после отказа сервера; обрыв связи ключ сохраняет —
// повтор того же нажатия второе дерево не посадит и энергию второй раз не возьмёт.
import { useRef } from "react";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { newOpId } from "@/lib/opId";
import { invalidateBackpack } from "@/lib/query";
import { serverErrorText } from "@/lib/serverErrorText";
import { PLACE_DIRS } from "@/lib/plainChest";
import { ENERGY_KEY } from "@/lib/hooks/useEnergy";
import { plantTextKey } from "@/lib/treePlant";
import { getTreePlantCells } from "@/server/api/beta-raid/tree/tree-plant-cells";
import { plantTree } from "@/server/api/beta-raid/tree/tree-plant";
import { invalidateBags } from "@/components/beta-raid/loot-bag/lootBagLive";

/** Ключ подсветки; префикс «beta-raid» — общий сброс при смене этажа. */
export const TREE_CELLS_KEY = ["beta-raid-tree-cells"] as const;

/** Отказ сервера ключом словаря («tree.road», «mineplace.no_energy|{…}») — не обрыв. */
const isRefusal = (e: Error): boolean => /^[a-z][a-z0-9]*\.[a-z0-9_]+(\||$)/i.test(e.message);

/** Всё, что меняет посадка: рюкзак, энергия, слой мешочков (кучка ушла под дерево), подсветка. */
export function invalidateTreePlant(qc: QueryClient): void {
  invalidateBackpack(qc);
  invalidateBags(qc);
  void qc.invalidateQueries({ queryKey: ENERGY_KEY, refetchType: "all" });
  void qc.invalidateQueries({ queryKey: ["beta-raid-state"], refetchType: "all" });
  void qc.invalidateQueries({ queryKey: TREE_CELLS_KEY });
}

export function useTreePlant(stackKey: string) {
  const t = useT();
  const qc = useQueryClient();
  const op = useRef(newOpId());
  const cells = useQuery({
    queryKey: TREE_CELLS_KEY,
    queryFn: () => getTreePlantCells(),
    staleTime: 0,
    retry: 1,
  });
  const plant = useMutation({
    mutationFn: (i: number) => plantTree({ data: { stackKey, ...PLACE_DIRS[i], op: op.current } }),
    onSuccess: () => {
      op.current = newOpId();
      toast.success(t(plantTextKey("tree.planted", stackKey)));
    },
    onError: (e: Error) => {
      if (isRefusal(e)) op.current = newOpId();
      // Отказ сервера общий (tree.road) — у камня свои слова (rock.road).
      const key = plantTextKey(e.message, stackKey);
      toast.error(serverErrorText(key === e.message ? e : new Error(key), t));
    },
    // Дерево у всех — дельтой карты (decor-respawn); здесь — своё без F5.
    onSettled: () => invalidateTreePlant(qc),
  });
  return { cells, plant };
}
