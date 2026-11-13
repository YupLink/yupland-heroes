// Множитель трат энергии на карте игрока (island/energy): остров новичка —
// 0,1, мир — 1. Карта игрока — из того же кэша состояния рейда, что читает
// SatietyBar: лишнего запроса нет, и клиент считает цену по той же карте, по
// которой спишет сервер. Пока состояние не пришло — мировые цены (1).
import { useQuery } from "@tanstack/react-query";
import { getBetaRaidState } from "@/server/api/beta-raid";
import { energyMultOf } from "@/lib/raid/island/energy";
import { satietyMultOf } from "@/lib/raid/island/satiety";
import { isIslandMapId } from "@/lib/raid/island/ids";
import type { RaidState } from "@/components/beta-raid/useBetaRaidData";

export function useRaidMapId(): string | null | undefined {
  const q = useQuery({ queryKey: ["beta-raid-state"], queryFn: () => getBetaRaidState() });
  return (q.data as RaidState | undefined)?.mapId;
}

export function useEnergyMult(): number {
  return energyMultOf(useRaidMapId());
}

/** Игрок на острове новичка (по карте состояния рейда). */
export function useOnIsland(): boolean {
  return isIslandMapId(useRaidMapId());
}

/** Множитель трат сытости (island/satiety): остров — 0,1, мир — 1. */
export function useSatietyMult(): number {
  return satietyMultOf(useRaidMapId());
}
