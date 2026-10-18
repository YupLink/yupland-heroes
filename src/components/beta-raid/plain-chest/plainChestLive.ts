// Обычный сундук и живой поток: ключи окна и что перечитать после своих дел.
//
// Окна сундука — свой префикс PLAIN_KEY ("beta-plain-chest"): сервер после
// «положить / забрать» шлёт событие 'bags' со scope 'chest' только тем, кто
// рядом, и useRaidLiveStream перечитывает лишь окна сундука (слой мешочков от
// перекладки не меняется); «забрать сундук / закопать» — обычное 'bags': и
// бугорки, и окна. Окно у соседа обновляется без F5 и без рассылки всей карте.
// Слой сундуков на карте — по 'built' (chestLive). В persist-кэше этого
// префикса нет (lib/query.ts) — вчерашнее содержимое не рисуется.
import type { QueryClient } from "@tanstack/react-query";
import { invalidateBackpack } from "@/lib/query";
import { PLAIN_KEY, invalidateBags } from "@/components/beta-raid/loot-bag/lootBagLive";
import { invalidateChests } from "@/components/beta-raid/chest/chestLive";

/** Окно сундука клетки. */
export const plainChestKey = (q: number, r: number) => [PLAIN_KEY, "at", q, r] as const;
/** Цифры «Забрать сундук» для подтверждения. */
export const plainPickupKey = (q: number, r: number) => [PLAIN_KEY, "pickup", q, r] as const;

/** Окна обычного сундука (содержимое и цифры «Забрать») — после своих дел и входа. */
export function invalidatePlain(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: [PLAIN_KEY], refetchType: "active" });
}

/**
 * После своего дела с сундуком: окно и рюкзак; сундук ушёл или встал (layer) —
 * ещё бугорки и мешочек остатка, и слой сундуков.
 */
export function refreshPlain(qc: QueryClient, layer = false): void {
  invalidatePlain(qc);
  invalidateBackpack(qc);
  if (!layer) return;
  invalidateBags(qc);
  invalidateChests(qc);
}
