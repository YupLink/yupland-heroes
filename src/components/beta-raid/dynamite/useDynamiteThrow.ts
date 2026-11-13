// Данные окна «Бросить динамит» (lib/dynamite): подсветка 37 клеток вокруг героя
// (dynamite-cells) и броски подряд (dynamite-throw, useCellBatch): натыканные
// клетки — по одной, у каждой свой ключ нажатия; обрыв связи ключ сохраняет —
// повтор той клетки второй раз не взорвёт и энергию не возьмёт. Первый отказ
// (кончилась энергия, клетка больше не годится) останавливает остальные.
//
// После бросков — без F5: рюкзак, энергия, мешочки, охрана, флажки и полосы шахт,
// «Добыча», награды над картой, карта. Своя карта правится после каждого броска
// (снятый декор, повержённые) — у остальных то же приходит дельтами и событиями.
// Тот же путь — у динамита в руке (hand/useHandItem): тап по карте вместо окна.
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { invalidateBackpack, invalidateRaidMap } from "@/lib/query";
import { serverErrorText } from "@/lib/serverErrorText";
import { summaryParts, type DynamiteSummary } from "@/lib/dynamite";
import { ENERGY_KEY } from "@/lib/hooks/useEnergy";
import { getDynamiteCells } from "@/server/api/beta-raid/dynamite/dynamite-cells";
import { throwDynamite, type DynamiteThrown } from "@/server/api/beta-raid/dynamite/dynamite-throw";
import { invalidateBags } from "@/components/beta-raid/loot-bag/lootBagLive";
import { MINE_GUARDS_KEY } from "@/components/beta-raid/mine/mineGuardsQuery";
import { MINE_LIFE_KEY } from "@/components/beta-raid/mine-life/mineLifeStore";
import { HARVEST_KEY } from "@/components/beta-raid/hud/useHarvest";
import { markCellDefeated } from "@/components/beta-raid/markDefeated";
import { patchMapCache, type MapLike } from "@/components/beta-raid/patchMapCache";
import { SHIPS_KEY } from "@/components/beta-raid/patchShipsCache";
import { useCellBatch } from "./useCellBatch";

/** Ключ подсветки; префикс «beta-raid» — общий сброс при смене этажа. */
export const DYNAMITE_CELLS_KEY = ["beta-raid-dynamite-cells"] as const;

/** Всё, что меняет взрыв, — и неактивным запросам (во время окон они неактивны). */
export function invalidateDynamite(qc: QueryClient, res: DynamiteSummary | null): void {
  invalidateBackpack(qc);
  invalidateBags(qc);
  for (const key of [ENERGY_KEY, ["beta-raid-state"], ["raid-pending-rewards"], HARVEST_KEY]) {
    void qc.invalidateQueries({ queryKey: key, refetchType: "all" });
  }
  for (const key of [
    MINE_GUARDS_KEY,
    MINE_LIFE_KEY,
    ["beta-raid-mine-flags"],
    ["beta-encounter"],
    ["beta-encounter-top"],
    DYNAMITE_CELLS_KEY,
  ]) {
    void qc.invalidateQueries({ queryKey: key });
  }
  if (!res || res.mines > 0 || res.kills > 0 || res.decor > 0) invalidateRaidMap(qc);
  // Синий взорвал корабли: своё событие «ships» бросившему не приходит — причалы и окна сами.
  if (!res || (res.ships ?? 0) > 0) {
    for (const key of [SHIPS_KEY, ["beta-raid-ships-at"], ["ship-repair"], ["ship-scrap"]]) {
      void qc.invalidateQueries({ queryKey: key });
    }
  }
}

/** Своя карта — сразу: снятый декор и повержённые верхние объекты. */
function patchOwnMap(qc: QueryClient, res: DynamiteThrown): void {
  for (const c of res.decorCells) {
    qc.setQueryData(["beta-raid-map"], (old: MapLike) =>
      old ? patchMapCache(old, { q: c.q, r: c.r, decorationId: null }) : old,
    );
  }
  for (const c of res.killedCells) markCellDefeated(qc, c.q, c.r);
}

/** Итог нескольких бросков — сумма итогов: один тост на всё нажатие. */
export function sumBlasts(list: readonly DynamiteSummary[]): DynamiteSummary {
  const n = (f: (s: DynamiteSummary) => number | undefined) =>
    list.reduce((sum, s) => sum + (f(s) ?? 0), 0);
  return {
    mines: n((s) => s.mines),
    hits: n((s) => s.hits),
    kills: n((s) => s.kills),
    decor: n((s) => s.decor),
    guardsOff: n((s) => s.guardsOff),
    levelsDown: n((s) => s.levelsDown),
    broken: n((s) => s.broken),
    ships: n((s) => s.ships),
    fish: n((s) => s.fish),
  };
}

/**
 * stackKey null — динамита в руке нет (подсветку не спрашиваем). `at` — клетка героя,
 * когда подсветка идёт за ним (динамит в руке); окну рюкзака она не нужна.
 */
export function useDynamiteThrow(
  stackKey: string | null,
  onDone: () => void,
  at: { q: number; r: number } | null = null,
) {
  const t = useT();
  const qc = useQueryClient();
  const key = stackKey ?? "";
  const cells = useQuery({
    queryKey: at ? [...DYNAMITE_CELLS_KEY, key, at.q, at.r] : [...DYNAMITE_CELLS_KEY, key],
    queryFn: () => getDynamiteCells({ data: { stackKey: key } }),
    enabled: !!stackKey,
    staleTime: 0,
    retry: 1,
  });
  const batch = useCellBatch<DynamiteThrown>({
    run: (to, op) => throwDynamite({ data: { stackKey: key, q: to.q, r: to.r, op } }),
    onEach: (res) => patchOwnMap(qc, res),
    onEnd: ({ results, all, error }) => {
      const sum = results.length ? sumBlasts(results) : null;
      if (sum) toast.success(summaryParts(sum, t));
      if (error) {
        const why = serverErrorText(error, t);
        toast.error(
          results.length ? `${t("dynamite.partial", { done: results.length, all })}: ${why}` : why,
        );
      }
      // Обрыв — исход последней клетки неизвестен (могло и взорвать): перечитать всё.
      invalidateDynamite(qc, error ? null : sum);
      if (!error) onDone();
    },
  });
  return { cells, batch };
}
