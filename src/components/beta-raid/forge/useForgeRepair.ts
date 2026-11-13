// Ремонт артефактов в кузнице (ПРАВИЛА §8.72): список изношенных и починка.
//
// Ключ повтора живёт до успеха и привязан к выбору: двойной тап и повтор после
// обрыва связи несут тот же opId — сервер второй раз ничего не спишет. Сменил
// выбор — новый ключ. Отказ базы ничего не записывает, повтор с ним же честен.
//
// После починки без F5: список ремонта, ресурсы (золото, алмазы), снаряжение и
// герои, инвентарь (invalidateHeroQueries — там my-hero-gear и my-game-items).
import { useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { humanError } from "@/lib/humanError";
import { useT } from "@/lib/i18n";
import { newOpId } from "@/lib/opId";
import { invalidateHeroQueries } from "@/lib/query";
import { RESOURCES_KEY } from "@/lib/hooks/useResources";
import type { RepairCost } from "@/lib/hero/artRepair";
import { getArtRepairList, repairArtifacts } from "@/server/api/art-repair/art-repair";

export const ART_REPAIR_KEY = ["art-repair-list"] as const;

/**
 * Изношенные артефакты аккаунта; грузим, только пока окно открыто. gcTime 0 —
 * закрыл окно, и список уходит из кэша: вчерашний снимок из persist-кэша
 * показывал бы уже починенное.
 */
export function useForgeRepairList(enabled: boolean) {
  return useQuery({
    queryKey: ART_REPAIR_KEY,
    queryFn: () => getArtRepairList(),
    enabled,
    staleTime: 0,
    gcTime: 0,
  });
}

export type RepairPick = { ids: string[]; all: boolean; expect: RepairCost };

/**
 * Подпись выбора: тот же выбор — тот же ключ нажатия. У «все» — со списком на
 * экране: износилось новое — другой список, новый ключ (а не прошлый итог).
 */
const sigOf = (p: RepairPick): string => (p.all ? "all:" : "") + [...p.ids].sort().join(",");

export function useForgeRepair(q: number, r: number) {
  const t = useT();
  const qc = useQueryClient();
  const op = useRef<{ sig: string; id: string } | null>(null);
  return useMutation({
    mutationFn: (p: RepairPick) => {
      const sig = sigOf(p);
      if (op.current?.sig !== sig) op.current = { sig, id: newOpId() };
      return repairArtifacts({
        data: {
          q,
          r,
          ids: p.all ? [] : p.ids,
          all: p.all,
          expectGold: p.expect.gold,
          expectDiamonds: p.expect.diamonds,
          opId: op.current.id,
        },
      });
    },
    onSuccess: (res) => {
      op.current = null;
      toast.success(t("artfix.done", { n: res.count }));
      void qc.invalidateQueries({ queryKey: ART_REPAIR_KEY });
      void qc.invalidateQueries({ queryKey: RESOURCES_KEY });
      invalidateHeroQueries(qc);
    },
    onError: (e: Error) => {
      toast.error(humanError(e));
      // Отказ «уже целый / не твой / цена другая» — список устарел: перечитать.
      void qc.invalidateQueries({ queryKey: ART_REPAIR_KEY });
      void qc.invalidateQueries({ queryKey: RESOURCES_KEY });
    },
  });
}
