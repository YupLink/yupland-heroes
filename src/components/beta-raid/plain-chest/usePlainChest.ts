// Окно обычного сундука: ответ сервера и действия — положить, забрать,
// «Забрать сундук» (с подтверждением цифр), закопать.
//
// Ключ нажатия (newOpId) — один на нажатие; у «Забрать сундук» — один на окно:
// повтор после обрыва связи получает тот же итог. Сундук с товаром сервер без
// подтверждения не отдаёт (pchest.confirm): окно показывает цифры — что в
// рюкзак, что мешочком — и ждёт «Забрать» с их отпечатком. После ответа
// перечитываются окно, бугорки, рюкзак, а если сундук ушёл — и слой карты.
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { newOpId } from "@/lib/opId";
import { formatQty } from "@/lib/formatQty";
import { serverErrorText } from "@/lib/serverErrorText";
import { getPlainChest } from "@/server/api/beta-raid/plain-chest/pchest-read";
import { putToPlainChest } from "@/server/api/beta-raid/plain-chest/pchest-put";
import { takeFromPlainChest } from "@/server/api/beta-raid/plain-chest/pchest-take";
import { pickUpPlainChest } from "@/server/api/beta-raid/plain-chest/pchest-pickup";
import { buryChest } from "@/server/api/beta-raid/plain-chest/pchest-dig";
import { announceDropped } from "@/components/beta-raid/loot-bag/lootBagLive";
import { plainChestKey, refreshPlain } from "@/components/beta-raid/plain-chest/plainChestLive";
import { invalidateEnergy } from "@/components/beta-raid/open-pass/useOpenStorage";

/**
 * Содержимое сундука. Без опроса, как окно мешочка: дела соседа приходят
 * событием 'bags' (сервер шлёт его всем рядом), свои — перечиткой после ответа.
 */
export function usePlainChestView(q: number, r: number) {
  return useQuery({
    queryKey: plainChestKey(q, r),
    queryFn: () => getPlainChest({ data: { q, r } }),
    // «Подойди» сразу после шага — сервер мог ещё не записать клетку: один повтор.
    retry: (n, e) => n < 1 && /chest\.approach/.test(e instanceof Error ? e.message : ""),
    retryDelay: 600,
    staleTime: 0,
  });
}

export type PlainMove = { stackKey: string; qty: number };

/** Закопать сундук (обычный — любой, магический — любой, но без живой охраны). */
export function useBuryChest(q: number, r: number, onDone: () => void) {
  const qc = useQueryClient();
  const t = useT();
  return useMutation({
    mutationFn: () => buryChest({ data: { q, r, op: newOpId() } }),
    onSuccess: () => {
      toast.success(t("pchest.buried_toast"));
      onDone();
    },
    onError: (e: Error) => toast.error(serverErrorText(e, t)),
    // Сундук ушёл в бугорок, у лопаты снялась прочность, 2 энергии: слой,
    // бугорки, рюкзак и шапка.
    onSettled: () => {
      refreshPlain(qc, true);
      invalidateEnergy(qc);
    },
  });
}

export function usePlainChestActions(
  q: number,
  r: number,
  o: { onMoved: () => void; onGone: () => void },
) {
  const qc = useQueryClient();
  const t = useT();
  const fail = (e: Error) => toast.error(serverErrorText(e, t));

  const put = useMutation({
    mutationFn: (v: PlainMove) => putToPlainChest({ data: { q, r, ...v, op: newOpId() } }),
    onSuccess: (res) => {
      toast.success(t("chest.stored_toast", { n: formatQty(Number(res.qty) || 0) }));
      o.onMoved();
    },
    onError: fail,
    onSettled: () => refreshPlain(qc),
  });

  const take = useMutation({
    mutationFn: (v: PlainMove) => takeFromPlainChest({ data: { q, r, ...v, op: newOpId() } }),
    onSuccess: (res) => {
      toast.success(t("bag.took", { n: formatQty(Number(res.qty) || 0) }));
      o.onMoved();
    },
    onError: fail,
    onSettled: () => refreshPlain(qc),
  });

  // «Забрать сундук»: ключ — на окно, подтверждение — отпечатком цифр.
  const pickOp = useRef(newOpId());
  const [confirming, setConfirming] = useState(false);
  const pickup = useMutation({
    mutationFn: (sig?: string) => pickUpPlainChest({ data: { q, r, op: pickOp.current, sig } }),
    onSuccess: (res) => {
      toast.success(t("chest.picked_toast"));
      const bagged = (res.bagged ?? []).reduce((n, b) => n + (Number(b.qty) || 0), 0);
      announceDropped(qc, t, bagged);
      setConfirming(false);
      o.onGone();
    },
    onError: (e: Error) => {
      if (e.message.includes("pchest.confirm")) setConfirming(true);
      else fail(e);
    },
    onSettled: () => refreshPlain(qc, true),
  });

  const bury = useBuryChest(q, r, o.onGone);

  return {
    put,
    take,
    pickup,
    bury,
    confirming,
    cancelConfirm: () => setConfirming(false),
    busy: put.isPending || take.isPending || pickup.isPending || bury.isPending,
  };
}
