// «Забрать сундук» из окна магического сундука — хозяином или чужим.
//
// Ключ нажатия op — один на окно: повтор после обрыва связи получает тот же
// итог из журнала, а не «сундука уже нет». Когда нужны цифры (последний
// сундук уносит сеть, у чужого без места сундук падает мешочком, охрана
// ранена), сервер отвечает chest.last_confirm: окно показывает цифры (что в
// рюкзак, что мешочком, «охрана ранена — не вернётся») и ждёт «Забрать» с их
// отпечатком sig. Цифры устарели под рукой — тот же отказ, окно перечитывает.
import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { newOpId } from "@/lib/opId";
import type { ChestPickupResult } from "@/lib/magicChest";
import { pickUpChest } from "@/server/api/beta-raid/chest/chest-pickup";
import { useChestFail, useChestRefresh } from "@/components/beta-raid/chest/useChestActions";
import { CHEST_PICKUP_KEY } from "@/components/beta-raid/chest/chestLive";
import { announceDropped, invalidateBags } from "@/components/beta-raid/loot-bag/lootBagLive";

type Press = { confirm: boolean; woundedOk: boolean; sig?: string };

export function useChestPickup(q: number, r: number, onDone: () => void) {
  const t = useT();
  const qc = useQueryClient();
  const fail = useChestFail();
  const refresh = useChestRefresh(true);
  const op = useRef(newOpId());
  const [confirming, setConfirming] = useState(false);
  const pick = useMutation({
    mutationFn: (v: Press): Promise<ChestPickupResult> =>
      pickUpChest({ data: { q, r, op: op.current, ...v } }),
    onSuccess: (res) => {
      toast.success(t(res.chestBagged ? "chest.lifted_bag_toast" : "chest.picked_toast"));
      const left = (res.bagged ?? []).reduce((n, p) => n + (Number(p.qty) || 0), 0);
      announceDropped(qc, t, left);
      invalidateBags(qc);
      setConfirming(false);
      onDone();
    },
    onError: (e: Error) => {
      if (!e.message.includes("chest.last_confirm")) return fail(e);
      // Нужны цифры — или те, что видел игрок, устарели: окно перечитывает.
      void qc.invalidateQueries({ queryKey: [CHEST_PICKUP_KEY, q, r] });
      setConfirming(true);
    },
    onSettled: refresh,
  });
  return {
    start: () => pick.mutate({ confirm: false, woundedOk: false }),
    /** woundedOk — окно показало «охрана ранена — не вернётся»; sig — отпечаток цифр. */
    confirm: (woundedOk: boolean, sig?: string) => pick.mutate({ confirm: true, woundedOk, sig }),
    cancel: () => setConfirming(false),
    confirming,
    busy: pick.isPending,
  };
}
