// Что меняется в каждом ударе — прямо из ответа удара, без перезапросов
// (владелец, 23.10.2026: «неизменные данные — один раз, изменяемые — просто
// менялись»).
//
// Карточка цели (шаблон, картинка, способности, награды, цена) грузится один
// раз за открытие окна; после удара в ней меняются только HP и «добит». Энергия
// списана ровно на spentEnergy (цена удара + выжигание) — её правим в общем
// кэше шапки и в состоянии рейда. Сверку с сервером даёт обычный опрос энергии
// (15 с), а состояние перечитывается, когда бой его правда менял (attackRefresh).
import type { QueryClient } from "@tanstack/react-query";
import { ENERGY_KEY, type EnergyData } from "@/lib/hooks/useEnergy";
import type { RaidState } from "../useBetaRaidData";

export const encounterKey = (t: { objectId: string; q: number; r: number }) =>
  ["beta-encounter", t.objectId, t.q, t.r] as const;
export const encounterTopKey = (t: { objectId: string; q: number; r: number }) =>
  ["beta-encounter-top", t.objectId, t.q, t.r] as const;

type Card = { currentHp?: number; maxHp?: number; killed?: boolean };

/** HP и «добит» в открытой карточке цели — остальное в ней неизменно. */
export function patchEncounterCard(
  qc: QueryClient,
  target: { objectId: string; q: number; r: number },
  hit: { hpAfter: number; maxHp: number; killed: boolean },
): void {
  qc.setQueryData(encounterKey(target), (old: Card | undefined) =>
    old ? { ...old, currentHp: hit.hpAfter, maxHp: hit.maxHp, killed: hit.killed } : old,
  );
}

/**
 * Списать энергию удара в кэше шапки и состояния. Метку свежести держим
 * прежней: догадка клиента не новее ответа сервера (как шаг, stepCache), и
 * таймер «+1 через …» не отматывается назад.
 */
export function spendEnergyLocally(qc: QueryClient, spent: number | undefined): void {
  const amount = Number(spent);
  if (!Number.isFinite(amount) || amount <= 0) return;
  void qc.cancelQueries({ queryKey: ENERGY_KEY });
  const energyAt = qc.getQueryState(ENERGY_KEY)?.dataUpdatedAt;
  qc.setQueryData(
    ENERGY_KEY,
    (old: EnergyData | undefined) =>
      old ? { ...old, energy: Math.max(0, old.energy - amount) } : old,
    energyAt ? { updatedAt: energyAt } : undefined,
  );
  const stateAt = qc.getQueryState(["beta-raid-state"])?.dataUpdatedAt;
  qc.setQueryData(
    ["beta-raid-state"],
    (old: RaidState | undefined) =>
      old ? { ...old, energy: Math.max(0, old.energy - amount) } : old,
    stateAt ? { updatedAt: stateAt } : undefined,
  );
}
