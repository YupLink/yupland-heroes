// Ответы окон сундука одним местом: окно владельца (сеть + рюкзак), охрана
// чужого сундука и цифры «Забрать сундук». Шапка окна и панель читают один
// ключ — запрос один.
import { useQuery } from "@tanstack/react-query";
import type { ChestPickupView } from "@/lib/magicChest";
import { getChestNet } from "@/server/api/beta-raid/chest/chest-net";
import { getChestGuard, type ForeignChestView } from "@/server/api/beta-raid/chest/chest-foreign";
import { getChestPickup } from "@/server/api/beta-raid/chest/chest-pickup";
import {
  CHEST_GUARD_KEY,
  CHEST_NET_KEY,
  CHEST_PICKUP_KEY,
} from "@/components/beta-raid/chest/chestLive";

/**
 * Сеть хозяина: своя или чужого (открыт без живой охраны). Без оплаченного
 * входа сервер отдаёт «закрыт» и цену (§8.23). Опрос раз в 30 с, как у склада:
 * второе устройство тоже видит. enabled=false — пока идёт бой с охраной.
 */
export function useChestNet(q: number, r: number, enabled = true) {
  return useQuery({
    queryKey: [CHEST_NET_KEY, q, r],
    queryFn: () => getChestNet({ data: { q, r } }),
    refetchInterval: 30_000,
    retry: false,
    enabled,
  });
}

/**
 * Чужой сундук: охрана с настоящим HP, хозяин и «открыт мне». enabled=false —
 * свой. staleTime 0: открыл окно снова — HP и «открыт» с сервера, а не из
 * минутного кэша.
 */
export function useChestGuard(q: number, r: number, enabled = true) {
  return useQuery({
    queryKey: [CHEST_GUARD_KEY, q, r],
    queryFn: (): Promise<ForeignChestView> => getChestGuard({ data: { q, r } }),
    enabled,
    staleTime: 0,
    retry: false,
  });
}

/**
 * Цифры «Забрать сундук»: что ляжет в рюкзак и что — мешочком. staleTime 0:
 * рюкзак меняется мимо этого ключа, а подтверждают ровно то, что видят (sig).
 */
export function useChestPickupView(q: number, r: number) {
  return useQuery({
    queryKey: [CHEST_PICKUP_KEY, q, r],
    queryFn: (): Promise<ChestPickupView> => getChestPickup({ data: { q, r } }),
    staleTime: 0,
    retry: false,
  });
}
