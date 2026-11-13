// Пакетный ответ «можно ли улучшить» — для фильтра Тренировочного лагеря.
//
//   const ready = useChipUpgradeReadiness();
//   const state = ready.data?.chips[chip.id];   // нет — нельзя (тренировочная)
//   state?.can → можно; иначе upgradeBlockText(state.reason, t)
//
// Ответ перечитывается сам, как только обновились фишки или золото
// (my-chip-inventory, my-resources) — после улучшения, покупки, продажи, ввода
// NFT, добычи: без отдельной инвалидации в каждом из этих мест.
import { useEffect } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { getChipUpgradeReadiness } from "@/server/api/chips-upgrade-ready";

export const UPGRADE_READY_KEY = ["chip-upgrade-ready"] as const;
const SOURCES = new Set(["my-chip-inventory", "my-resources"]);

/** Свежие фишки или золото → ответ устарел. Возвращает отписку. */
export function watchUpgradeSources(qc: QueryClient): () => void {
  return qc.getQueryCache().subscribe((e) => {
    if (e.type !== "updated" || e.action.type !== "success") return;
    if (SOURCES.has(String(e.query.queryKey[0])))
      void qc.invalidateQueries({ queryKey: UPGRADE_READY_KEY });
  });
}

export function useChipUpgradeReadiness(enabled = true) {
  const qc = useQueryClient();
  useEffect(() => (enabled ? watchUpgradeSources(qc) : undefined), [qc, enabled]);
  return useQuery({
    queryKey: UPGRADE_READY_KEY,
    queryFn: () => getChipUpgradeReadiness(),
    enabled,
    staleTime: 30_000,
  });
}
