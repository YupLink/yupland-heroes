// После удара по охране шахты или сундука (MineGuardFight): перечитываем
// только то, что удар МОГ изменить (владелец, 23.10.2026), энергию списываем
// из ответа. Раньше каждый удар тянул с refetchType "all" окно шахты, весь
// слой охраны и флагов карты, энергию, состояние рейда и инвентарь фишек
// (у крупных аккаунтов ~460 КБ).
import type { QueryClient } from "@tanstack/react-query";
import { chipsChanged, stateChanged } from "../attackRefresh";
import { spendEnergyLocally } from "../fight/fightCachePatch";

export type GuardHit = {
  killed: boolean;
  spentEnergy?: number;
  burnedEnergy?: number;
  slowed?: unknown;
  chipEffects?: ReadonlyArray<{ kind: string }> | null;
  chipsChanged?: boolean;
  abilityLog?: unknown;
  abilityTotals?: unknown;
  artBroken?: ReadonlyArray<unknown> | null;
};

export function guardRefreshKeys(
  res: GuardHit,
  q: number,
  r: number,
): { all: unknown[][]; active: unknown[][] } {
  // Окно клетки показывает HP охранника — перечитываем только его, открытое.
  const active: unknown[][] = [["beta-raid-building", q, r]];
  const all: unknown[][] = [];
  // Слой охраны и флаги шахт меняются, когда охрана пала (шахта открылась).
  if (res.killed) all.push(["beta-raid-mine-guards"], ["beta-raid-mine-flags"]);
  if (stateChanged(res)) all.push(["beta-raid-state"]);
  if (chipsChanged(res)) active.push(["my-chip-inventory"]);
  return { all, active };
}

export function refreshAfterGuardHit(qc: QueryClient, res: GuardHit, q: number, r: number): void {
  const keys = guardRefreshKeys(res, q, r);
  for (const key of keys.all) void qc.invalidateQueries({ queryKey: key, refetchType: "all" });
  for (const key of keys.active) void qc.invalidateQueries({ queryKey: key, exact: true });
  spendEnergyLocally(qc, res.spentEnergy);
}
