// Действия с сундуком: положить в сеть, забрать из сети (свой или чужой без
// охраны), поставить из рюкзака (с охраной или без). После каждого — рюкзак и все
// ключи сундука, с refetchType 'all' (как invalidateBackpack): окна склада и
// рюкзака бывают неактивны.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useLang, useT } from "@/lib/i18n";
import { serverErrorText } from "@/lib/serverErrorText";
import { useState } from "react";
import { useStorageMove } from "../useStorageMove";
import { invalidateBackpack } from "@/lib/query";
import { storeToChest, takeFromChest } from "@/server/api/beta-raid/chest/chest-net";
import { placeMagicChest } from "@/server/api/beta-raid/chest/chest-place";
import type { BackpackStack } from "@/server/api/beta-raid/market-backpack";
import { CHEST_NET_KEY, invalidateChests } from "@/components/beta-raid/chest/chestLive";

/** Ошибка сервера — ключом chest.* / market.* или фразой — на языке игрока. */
export function useChestFail() {
  const t = useT();
  return (e: Error) => toast.error(serverErrorText(e, t));
}

/**
 * Рюкзак и окна сундука — после любого дела с сундуком. guards — дело меняет
 * охрану на карте (поставить, забрать сундук): слой охраны тоже.
 */
export function useChestRefresh(guards = false) {
  const qc = useQueryClient();
  return () => {
    invalidateBackpack(qc);
    invalidateChests(qc);
    if (guards) {
      void qc.invalidateQueries({ queryKey: ["beta-raid-mine-guards"], refetchType: "all" });
    }
  };
}

/** Окно владельца: сеть ↔ рюкзак. busy — ключ ячейки, по которой тапнули. */
export function useChestNetActions(q: number, r: number) {
  const t = useT(), lang = useLang(), qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const refreshMoves = async () => {
    invalidateBackpack(qc); invalidateChests(qc);
    await Promise.all([
      qc.refetchQueries({ queryKey: [CHEST_NET_KEY, q, r], type: 'active' }, { throwOnError: true }),
      qc.refetchQueries({ queryKey: ['my-hero-backpack'], type: 'active' }, { throwOnError: true }),
    ]);
  };
  const move = useStorageMove(lang, refreshMoves, e => serverErrorText(e, t), false);
  type Input = { stackKey: string; qty: number; cell: string; requested?: number; sourceTotal?: number };
  const start = (v: Input, put: boolean, done?: () => void) => {
    if (move.pending || move.blocked) return;
    void move.run({
      requested: v.requested ?? v.qty, sourceTotal: v.sourceTotal, source: put ? 'backpack' : 'chest',
      send: async () => {
        setBusy(`${put ? 'in' : 'out'}:${v.cell}`);
        const call = put ? storeToChest : takeFromChest;
        const res = await call({ data: { q, r, stackKey: v.stackKey, qty: v.qty } });
        return res.qty;
      }, done,
    }).then(admitted => { if (admitted) setBusy(null); });
  };
  const put = { mutate: (v: Input) => start(v, true), isPending: move.pending && !!busy?.startsWith('in:') };
  const take = { mutate: (v: Input, options?: { onSuccess: () => void }) => start(v, false, options?.onSuccess), isPending: move.pending && !!busy?.startsWith('out:') };
  return { put, take, busy, move };
}

/** Стек рюкзака — магический сундук (галочка у своего товара). */
export const isChestStack = (s: BackpackStack): boolean => s.chest;

/** Боссы рюкзака — кандидаты в охрану сундука. */
export const guardStacks = (stacks: readonly BackpackStack[]): BackpackStack[] =>
  stacks.filter((s) => s.kind === "boss");

/** Рюкзак: поставить сундук на клетку под героем — с охранником-боссом или без. */
export function usePlaceChest(onPlaced?: () => void) {
  const t = useT();
  const fail = useChestFail();
  const refresh = useChestRefresh(true);
  return useMutation({
    mutationFn: (v: { stackKey: string; guardKey?: string; dq?: number; dr?: number }) =>
      placeMagicChest({ data: v }),
    onSuccess: () => {
      toast.success(t("chest.placed_toast"));
      onPlaced?.();
    },
    onError: fail,
    onSettled: refresh,
  });
}
