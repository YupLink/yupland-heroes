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
import { useLang, useT } from "@/lib/i18n";
import { newOpId } from "@/lib/opId";
import { useStorageMove } from "../useStorageMove";
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

export type PlainMove = { stackKey: string; qty: number; requested: number; sourceTotal: number };

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

  const lang = useLang();
  const [side, setSide] = useState<'put' | 'take'>('put');
  const refreshMoves = async () => {
    refreshPlain(qc);
    await Promise.all([
      qc.refetchQueries({ queryKey: plainChestKey(q, r), type: 'active' }, { throwOnError: true }),
      qc.refetchQueries({ queryKey: ['my-hero-backpack'], type: 'active' }, { throwOnError: true }),
    ]);
  };
  const move = useStorageMove(lang, refreshMoves, e => serverErrorText(e, t), false);
  const start = (v: PlainMove, put: boolean) => {
    if (move.pending || move.blocked) return;
    setSide(put ? 'put' : 'take');
    void move.run({
      requested: v.requested, sourceTotal: v.sourceTotal, source: put ? 'backpack' : 'chest',
      send: async () => {
        const call = put ? putToPlainChest : takeFromPlainChest;
        const res = await call({ data: { q, r, stackKey: v.stackKey, qty: v.qty, op: newOpId() } });
        return res.qty;
      },
      done: o.onMoved,
    });
  };
  const put = { mutate: (v: PlainMove) => start(v, true), isPending: move.pending && side === 'put' };
  const take = { mutate: (v: PlainMove) => start(v, false), isPending: move.pending && side === 'take' };

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
    move,
    pickup,
    bury,
    confirming,
    cancelConfirm: () => setConfirming(false),
    busy: move.pending || move.blocked || pickup.isPending || bury.isPending,
  };
}
