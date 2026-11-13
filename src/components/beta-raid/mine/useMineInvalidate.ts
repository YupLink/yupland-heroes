// Всё, что меняет действие с шахтой (захват, сбор, починка, режим), — одним
// вызовом: окно шахты, счётчики ресурсов, флажки, «Добыча», охрана. Иначе
// какой-то из экранов показывал бы прежнее до F5.
import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ENERGY_KEY } from "@/lib/hooks/useEnergy";
import { RESOURCES_KEY } from "@/lib/hooks/useResources";
import { ACC_BALANCES_KEY } from "@/lib/hooks/useAccountBalances";
import { MINE_PENDINGS_KEY } from "@/lib/hooks/useMinePendings";
import { HARVEST_KEY } from "../hud/useHarvest";
import { MINE_GUARDS_KEY } from "./mineGuardsQuery";

export function useMineInvalidate(q: number, r: number): () => void {
  const qc = useQueryClient();
  return useCallback(() => {
    qc.invalidateQueries({ queryKey: ["beta-raid-building", q, r] });
    qc.invalidateQueries({ queryKey: ENERGY_KEY });
    // Захват стоит герою сытости — шкала в состоянии карты.
    qc.invalidateQueries({ queryKey: ["beta-raid-state"] });
    // Сбор начисляет, починка списывает — полоса ресурсов и счёт.
    qc.invalidateQueries({ queryKey: RESOURCES_KEY });
    qc.invalidateQueries({ queryKey: ACC_BALANCES_KEY });
    qc.invalidateQueries({ queryKey: MINE_PENDINGS_KEY });
    // Сменился владелец — флажок над шахтой перекрасить сразу, без F5.
    qc.invalidateQueries({ queryKey: ["beta-raid-mine-flags"] });
    // Шахта и цифра на кружке «Добыча» — сразу, а не через 60–120 с опроса.
    qc.invalidateQueries({ queryKey: HARVEST_KEY });
    // Охранник мог смениться, погибнуть или сбежать с поломкой.
    qc.invalidateQueries({ queryKey: MINE_GUARDS_KEY });
  }, [qc, q, r]);
}
