// Клейм очереди наград из окна «Добыча»: всё разом или одну группу по типу.
//
// Обе мутации заканчиваются ОДИНАКОВО — тост с итогом и один список
// инвалидаций. Своя копия списка у каждой кнопки разъехалась бы: забрал лайки
// по группе — а число в шапке рейда не поменялось (правило «обновление
// страницы = табу»).
import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { humanError } from "@/lib/humanError";
import { showClaimResult } from "@/lib/claimToast";
import { rewardGroupKey } from "@/lib/rewardGroup";
import { claimRaidRewardGroup, claimRaidRewards } from "@/server/api/raid-rewards";
import { RESOURCES_KEY } from "@/lib/hooks/useResources";
import { ENERGY_KEY } from "@/lib/hooks/useEnergy";
import { invalidateHeroQueries } from "@/lib/query";
import { HARVEST_KEY } from "./useHarvest";

/**
 * Что перечитать после выдачи, кроме всего, что зависит от героя
 * (HERO_QUERY_KEYS: рюкзак, артефакты, склад). Ресурс уходит на СЧЁТ, лайки и
 * билеты — на свои балансы, пак — в «Мои паки», токен — заявкой в «Выплаты».
 */
const TOUCHED: string[][] = [
  [...HARVEST_KEY],
  ["raid-pending-rewards"],
  ["my-tickets"],
  ["my-like-balance"],
  ["my-chip-packs"],
  ["my-payouts"],
  [...ENERGY_KEY],
  [...RESOURCES_KEY],
];

export type GroupClaimVars = {
  kind: string;
  packId: string | null;
  /** Подпись группы для тоста — та же, что в строке списка. */
  label: string;
};

export function useRewardClaim() {
  const t = useT();
  const qc = useQueryClient();
  // Два тапа до перерисовки дают два запроса: второй получит от сервера
  // empty:true и показал бы «уже забраны» следом за зелёным итогом. isPending
  // обновляется асинхронно, поэтому гард — синхронный ref.
  const inFlight = useRef(false);

  const afterClaim = () => {
    invalidateHeroQueries(qc, ["my-chip-inventory"]);
    for (const key of TOUCHED) qc.invalidateQueries({ queryKey: key, refetchType: "all" });
  };
  const onFail = (e: Error) => toast.error(humanError(e));
  // Перечитываем и после сбоя: жёсткая ошибка на N-й строке не отменяет
  // начисленных до неё — иначе забранное висело бы «в очереди» до опроса.
  const settle = () => {
    inFlight.current = false;
    afterClaim();
  };

  const all = useMutation({
    mutationFn: () => claimRaidRewards(),
    onSuccess: (res) => {
      // Пусто — очередь уже унёс параллельный заход: нейтрально, как у группы.
      if (res.empty) return void toast.info(t("braid.rewards_already"));
      // Не только успех: то, что не доехало (полный рюкзак, нет героя), сервер
      // вернул в res.warnings — без этого товар молча оставался в очереди.
      showClaimResult(res, t, t("braid.rewards_claimed"));
    },
    onError: onFail,
    onSettled: settle,
  });

  const group = useMutation({
    mutationFn: (v: GroupClaimVars) =>
      claimRaidRewardGroup({ data: { kind: v.kind, packId: v.packId } }),
    onSuccess: (res, v) => {
      // Пусто — группу уже унёс параллельный заход (другое устройство,
      // «Забрать всё»): не ошибка, но и не «забрано 0».
      if (res.empty) toast.info(t("braid.rewards_already"));
      else
        showClaimResult(
          res,
          t,
          res.left > 0
            ? t("harvest.group_left", { label: v.label, n: res.claimed, left: res.left })
            : t("harvest.group_claimed", { label: v.label, n: res.claimed }),
        );
    },
    onError: onFail,
    onSettled: settle,
  });

  const pending = all.isPending || group.isPending;
  const claimAll = () => {
    if (inFlight.current) return;
    inFlight.current = true;
    all.mutate();
  };
  const claimGroup = (v: GroupClaimVars) => {
    if (inFlight.current) return;
    inFlight.current = true;
    group.mutate(v);
  };
  /** Ключ группы, чья кнопка сейчас крутится; null — крутится общая или ничего. */
  const busyKey =
    group.isPending && group.variables
      ? rewardGroupKey(group.variables.kind, group.variables.packId)
      : null;

  return { claimAll, claimGroup, pending, allPending: all.isPending, busyKey };
}
