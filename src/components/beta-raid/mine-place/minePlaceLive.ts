// После своей постановки шахты: что перечитать сразу, без F5. Клетку с шахтой
// карта получает дельтой «map» (журнал карты), здесь — своё: рюкзак (заготовка
// ушла), энергия (постановка платная), чертёж (его стёрла постановка), флажок
// и «Добыча» (шахта уже моя), окно постройки клетки.
import type { QueryClient } from "@tanstack/react-query";
import { invalidateBackpack } from "@/lib/query";
import { ENERGY_KEY } from "@/lib/hooks/useEnergy";
import { MINE_PENDINGS_KEY } from "@/lib/hooks/useMinePendings";
import { HARVEST_KEY } from "@/components/beta-raid/hud/useHarvest";
import { MINE_PLAN_KEY } from "@/components/beta-raid/mine-build/mineBuildStore";

export function refreshAfterMinePlace(qc: QueryClient, cell?: { q: number; r: number }): void {
  invalidateBackpack(qc);
  void qc.invalidateQueries({ queryKey: ENERGY_KEY });
  void qc.invalidateQueries({ queryKey: MINE_PLAN_KEY });
  void qc.invalidateQueries({ queryKey: ["beta-raid-mine-flags"] });
  void qc.invalidateQueries({ queryKey: HARVEST_KEY });
  void qc.invalidateQueries({ queryKey: MINE_PENDINGS_KEY });
  if (cell) void qc.invalidateQueries({ queryKey: ["beta-raid-building", cell.q, cell.r] });
}
