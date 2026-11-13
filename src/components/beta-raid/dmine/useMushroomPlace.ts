// Гриб в руке (владелец, 31.10.2026: «возможность ставить грибы через руку»): круг —
// своя клетка и шесть соседних (PLACE_DIRS, как в окне посадки); можно ли — решает
// сервер при посадке (дорога, проход, игрок, энергия). Сажает тот же placeDaraiMine,
// что окно, со смещением от героя; подряд — по отметкам (useCellBatch).
import { useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { serverErrorText } from "@/lib/serverErrorText";
import { PLACE_DIRS } from "@/lib/plainChest";
import { placeDaraiMine } from "@/server/api/beta-raid/dmine/dmine-place";
import { useCellBatch } from "@/components/beta-raid/dynamite/useCellBatch";
import { invalidateDaraiMines } from "./useDaraiMines";

type Hex = { q: number; r: number };

export function useMushroomPlace(stackKey: string | null, at: Hex | null) {
  const t = useT();
  const qc = useQueryClient();
  const here = useRef(at);
  here.current = at;
  const [q, r] = [at?.q, at?.r];
  // Тот же вид, что у кругов земли и жилы (данные запроса), — круг считается на месте.
  const cells = useMemo(
    () => ({
      data:
        stackKey && q != null && r != null
          ? {
              center: { q, r },
              cells: PLACE_DIRS.map((d) => ({ ...d, ok: true, reason: null })),
            }
          : undefined,
      isError: false,
      error: null,
    }),
    [stackKey, q, r],
  );
  const batch = useCellBatch({
    run: (cell, op) => {
      const c = here.current ?? cell;
      return placeDaraiMine({
        data: { stackKey: stackKey ?? "", dq: cell.q - c.q, dr: cell.r - c.r, op },
      });
    },
    onEnd: ({ results, all, error }) => {
      const n = results.length;
      if (n > 0) toast.success(n === 1 ? t("dmine.placed_toast") : t("dmine.placed_n", { n }));
      if (error) {
        const why = serverErrorText(error, t);
        toast.error(n > 0 ? `${t("vein.partial", { done: n, all })}: ${why}` : why);
      }
      invalidateDaraiMines(qc);
    },
  });
  return { cells, batch };
}
