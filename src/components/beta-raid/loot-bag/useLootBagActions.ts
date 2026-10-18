// Действия окна мешочка: забрать (стопку или всё), положить, закопать, выкопать.
//
// Ключ нажатия (newOpId) — один на нажатие: сервер по нему отличает повтор от
// нового действия. После ответа перечитываются слой мешочков, окно и рюкзак
// (штуки переехали, у лопаты снялась прочность) — без F5. Отказ окно «сколько»
// не закрывает: поправил число — и снова (как у склада).
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { humanError } from "@/lib/humanError";
import { invalidateBackpack } from "@/lib/query";
import { newOpId } from "@/lib/opId";
import { formatQty } from "@/lib/formatQty";
import { takeFromLootBag } from "@/server/api/beta-raid/loot-bag/bag-take";
import { putToLootBag } from "@/server/api/beta-raid/loot-bag/bag-put";
import { buryLootBag, digLootBag } from "@/server/api/beta-raid/loot-bag/bag-dig";
import { digChest } from "@/server/api/beta-raid/plain-chest/pchest-dig";
import { isChestMound } from "@/lib/plainChest";
import { invalidateBags } from "@/components/beta-raid/loot-bag/lootBagLive";
import { invalidateChests } from "@/components/beta-raid/chest/chestLive";
import { invalidateEnergy } from "@/components/beta-raid/open-pass/useOpenStorage";

export type BagTake = { bagId: string; stackKey?: string; qty?: number };
export type BagPut = { bagId: string; stackKey: string; qty: number };

export function useLootBagActions(onDone?: () => void) {
  const qc = useQueryClient();
  const t = useT();
  const refresh = () => {
    invalidateBags(qc);
    invalidateBackpack(qc);
    onDone?.();
  };
  const fail = (e: Error) => {
    toast.error(humanError(e));
    // Отказ часто значит «мешочек уже другой» — окно перечитываем.
    invalidateBags(qc);
  };

  const take = useMutation({
    mutationFn: (v: BagTake) => takeFromLootBag({ data: { ...v, op: newOpId() } }),
    onSuccess: (res) => {
      const n = (res.taken ?? []).reduce((sum, it) => sum + (Number(it.qty) || 0), 0);
      toast.success(t("bag.took", { n: formatQty(n) }));
      refresh();
    },
    onError: fail,
  });

  const put = useMutation({
    mutationFn: (v: BagPut) => putToLootBag({ data: { ...v, op: newOpId() } }),
    onSuccess: (res) => {
      toast.success(t("bag.put_toast", { n: formatQty(Number(res.qty) || 0) }));
      refresh();
    },
    onError: fail,
  });

  // Бугорок сундука (§8.22) выкапывается своей ручкой — по клетке: окно у
  // бугорков одно, а под ним встаёт сундук (слой сундуков перечитываем).
  const dig = useMutation({
    mutationFn: (v: { bagId: string; bury: boolean; at: { q: number; r: number } }) =>
      isChestMound(v.bagId)
        ? digChest({ data: { ...v.at, op: newOpId() } })
        : (v.bury ? buryLootBag : digLootBag)({ data: { bagId: v.bagId, op: newOpId() } }),
    onSuccess: (res, v) => {
      toast.success(t(res.buried ? "bag.buried_toast" : "bag.dug_toast"));
      if (isChestMound(v.bagId)) invalidateChests(qc);
      // Лопата стоит 2 энергии (§8.23) — шапка сразу.
      invalidateEnergy(qc);
      refresh();
    },
    onError: fail,
  });

  return {
    take,
    put,
    dig,
    busy: take.isPending || put.isPending || dig.isPending,
  };
}
