// Действия с сундуком: положить в сеть, забрать из сети (свой или чужой без
// охраны), поставить из рюкзака (с охраной или без). После каждого — рюкзак и все
// ключи сундука, с refetchType 'all' (как invalidateBackpack): окна склада и
// рюкзака бывают неактивны.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { serverErrorText } from "@/lib/serverErrorText";
import { formatQty } from "@/lib/formatQty";
import { invalidateBackpack } from "@/lib/query";
import { storeToChest, takeFromChest } from "@/server/api/beta-raid/chest/chest-net";
import { placeMagicChest } from "@/server/api/beta-raid/chest/chest-place";
import type { BackpackStack } from "@/server/api/beta-raid/market-backpack";
import { invalidateChests } from "@/components/beta-raid/chest/chestLive";

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
  const t = useT();
  const fail = useChestFail();
  const refresh = useChestRefresh();
  const put = useMutation({
    mutationFn: (v: { stackKey: string; qty: number; cell: string }) =>
      storeToChest({ data: { q, r, stackKey: v.stackKey, qty: v.qty } }),
    onSuccess: (res) => toast.success(t("chest.stored_toast", { n: formatQty(res.qty) })),
    onError: fail,
    onSettled: refresh,
  });
  const take = useMutation({
    mutationFn: (v: { stackKey: string; qty: number; cell: string }) =>
      takeFromChest({ data: { q, r, stackKey: v.stackKey, qty: v.qty } }),
    onSuccess: (res) => toast.success(t("braid.wh_taken", { n: formatQty(res.qty) })),
    onError: fail,
    onSettled: refresh,
  });
  const busy = put.isPending
    ? `in:${put.variables?.cell ?? ""}`
    : take.isPending
      ? `out:${take.variables?.cell ?? ""}`
      : null;
  return { put, take, busy };
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
