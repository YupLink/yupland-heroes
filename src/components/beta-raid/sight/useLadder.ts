// Лестница на карте (§8.121): пока режим включён, тап по подсвеченной клетке —
// «Перелезть» (шаг героя через непроходимую клетку), по любой другой — отказ
// тостом. Нет ни одной цели — режим гаснет сразу с объяснением.
import { useEffect, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { serverErrorText } from "@/lib/serverErrorText";
import { invalidateBackpack } from "@/lib/query";
import { RESOURCES_KEY } from "@/lib/hooks/useResources";
import { ENERGY_KEY } from "@/lib/hooks/useEnergy";
import { climbLadder } from "@/server/api/beta-raid/sight/ladder-climb";
import type { Cell } from "../unpackMap";
import type { TerrainInfo } from "../hexStepCost";
import {
  attachLadderMap,
  setLadderTargets,
  stopLadderMode,
  useLadderMode,
  type Hex,
} from "./ladderMode";
import { ladderTargets } from "./ladderTargets";

/** Пустой словарь местностей — одной ссылкой (зависимость memo). */
const NO_TERRAINS: Record<string, TerrainInfo> = {};

export function useLadder(o: {
  playerPos: Hex | null;
  cells: Record<string, Cell>;
  terrains: Record<string, TerrainInfo> | undefined;
}): { tap: (q: number, r: number) => boolean } {
  const t = useT();
  const qc = useQueryClient();
  const on = useLadderMode();
  const { playerPos, cells } = o;
  const terrains = o.terrains ?? NO_TERRAINS;
  const targets = useMemo(
    () => (on ? ladderTargets(playerPos, cells, terrains) : []),
    [on, playerPos, cells, terrains],
  );
  useEffect(() => {
    if (!on) return;
    if (targets.length === 0) {
      toast(t("braid.ladder_none"));
      stopLadderMode();
      return;
    }
    setLadderTargets(targets);
  }, [on, targets, t]);
  // Карта ведёт лестницу, пока открыта; ушли — режим гаснет вместе с ней.
  useEffect(() => attachLadderMap(), []);

  const climb = useMutation({
    mutationFn: (to: Hex) => climbLadder({ data: to }),
    onSuccess: (res) => {
      toast.success(t("braid.ladder_done"));
      stopLadderMode();
      // Позиция и энергия — сразу, остальное перечитается.
      qc.setQueryData(["beta-raid-state"], (old: Record<string, unknown> | undefined) =>
        old ? { ...old, position: res.position, energy: res.remainingEnergy } : old,
      );
      void qc.invalidateQueries({ queryKey: ["beta-raid-state"] });
      void qc.invalidateQueries({ queryKey: ENERGY_KEY });
      void qc.invalidateQueries({ queryKey: RESOURCES_KEY });
      invalidateBackpack(qc);
    },
    onError: (e: Error) => toast.error(serverErrorText(e, t)),
  });

  const tap = (q: number, r: number): boolean => {
    if (!on) return false;
    if (climb.isPending) return true;
    if (targets.some((c) => c.q === q && c.r === r)) climb.mutate({ q, r });
    else toast.error(t("braid.ladder_bad"));
    return true;
  };
  return { tap };
}
