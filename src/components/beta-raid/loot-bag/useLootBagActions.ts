// Действия окна мешочка: забрать (стопку или всё), положить, закопать, выкопать.
//
// Ключ нажатия (newOpId) — один на нажатие: сервер по нему отличает повтор от
// нового действия. После ответа перечитываются слой мешочков, окно и рюкзак
// (штуки переехали, у лопаты снялась прочность) — без F5. Отказ окно «сколько»
// не закрывает: поправил число — и снова (как у склада). «Забрать всё» унесло
// не всё — один тост «Не влезло: …» (что осталось в мешочке) вместо «Забрано».
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { humanError } from "@/lib/humanError";
import { invalidateBackpack } from "@/lib/query";
import { newOpId } from "@/lib/opId";
import { formatQty } from "@/lib/formatQty";
import { bagArtOf, bagResOf } from "@/lib/lootBag";
import { RESOURCES_KEY } from "@/lib/hooks/useResources";
import { ACC_BALANCES_KEY } from "@/lib/hooks/useAccountBalances";
import { takeFromLootBag } from "@/server/api/beta-raid/loot-bag/bag-take";
import { putToLootBag } from "@/server/api/beta-raid/loot-bag/bag-put";
import { buryLootBag, digLootBag } from "@/server/api/beta-raid/loot-bag/bag-dig";
import { digChest } from "@/server/api/beta-raid/plain-chest/pchest-dig";
import { isChestMound } from "@/lib/plainChest";
import { invalidateBags } from "@/components/beta-raid/loot-bag/lootBagLive";
import { invalidateChests } from "@/components/beta-raid/chest/chestLive";
import { invalidateEnergy } from "@/components/beta-raid/open-pass/useOpenStorage";
import { useBagItemName } from "@/components/beta-raid/loot-bag/useBagItemName";

export type BagTake = { bagId: string; stackKey?: string; qty?: number };
export type BagPut = { bagId: string; stackKey: string; qty: number };

export function useLootBagActions(onDone?: () => void) {
  const qc = useQueryClient();
  const t = useT();
  const itemName = useBagItemName();
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
      const taken = Array.isArray(res.taken) ? res.taken : [];
      const left = Array.isArray(res.left) ? res.left : [];
      const n = taken.reduce((sum, it) => sum + (Number(it.qty) || 0), 0);
      if (left.length > 0) {
        const list = left.map((l) => `${itemName(l.name, l.stackKey)} ${formatQty(l.qty)}`);
        toast.warning(t("bag.not_fit", { list: list.join(", ") }));
      } else toast.success(t("bag.took", { n: formatQty(n) }));
      // Ресурс счёта (разборка шахты, §8.70) лёг на счёт — полоса ресурсов и счёт сразу.
      if (taken.some((it) => bagResOf(it.stackKey))) {
        void qc.invalidateQueries({ queryKey: RESOURCES_KEY });
        void qc.invalidateQueries({ queryKey: ACC_BALANCES_KEY });
      }
      // Артефакт (§8.73 п. 4) лёг в инвентарь — инвентарь и снаряжение сразу.
      if (taken.some((it) => bagArtOf(it.stackKey))) {
        void qc.invalidateQueries({ queryKey: ["my-game-items"] });
        void qc.invalidateQueries({ queryKey: ["my-hero-gear"] });
      }
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
      // Кучка из пустой ямки (§8.24 п. 6б) — внутри ничего.
      if ("empty" in res && res.empty) toast(t("dig.nothing"));
      else toast.success(t(res.buried ? "bag.buried_toast" : "bag.dug_toast"));
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
