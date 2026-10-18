// Мешочки и живой поток: ключи запросов и какое событие 'bags' касается меня.
//
// Сервер шлёт событие без содержимого — только клетку — и только тем, кто рядом
// (routes/api.beta-raid.events.ts). Здесь последний рубеж: событие дальше
// «второго обзора» (+1 на шаг) слой не перечитывает — ни запроса за чужую окраину.
import type { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { hexDistance } from "@/lib/raid/hex";
import { formatQty } from "@/lib/formatQty";
import { LOOT_BAG_SEE } from "@/lib/lootBag";

/** Общий префикс: слой карты ["beta-loot-bags","near"] и окно ["beta-loot-bags","at",q,r]. */
export const BAGS_KEY = "beta-loot-bags";
/** Окна обычного сундука — свой префикс (plainChestLive): перекладка слой не трогает. */
export const PLAIN_KEY = "beta-plain-chest";

/**
 * Что перечитать по событию 'bags' рядом: перекладка в обычном сундуке
 * (scope 'chest') — только окна сундука, остальное — и слой, и окна.
 */
export const bagEventKeys = (e: unknown): string[] =>
  (e as { scope?: unknown } | null)?.scope === "chest" ? [PLAIN_KEY] : [BAGS_KEY, PLAIN_KEY];
export const BAGS_NEAR_KEY = [BAGS_KEY, "near"] as const;
export const bagsAtKey = (q: number, r: number) => [BAGS_KEY, "at", q, r] as const;

/** Задело ли событие мой «второй обзор». Позиции ещё нет — не перечитываем. */
export function bagEventNear(qc: QueryClient, cells: readonly string[]): boolean {
  const me = (
    qc.getQueryData(["beta-raid-state"]) as { position?: { q: number; r: number } | null }
  )?.position;
  if (!me) return false;
  // Игроку сервер шлёт событие без клеток (координаты чужой добычи не уходят):
  // он и так отфильтровал его по расстоянию — перечитываем.
  if (cells.length === 0) return true;
  return cells.some((key) => {
    const [q, r] = key.split(",").map(Number);
    return (
      Number.isFinite(q) && Number.isFinite(r) && hexDistance(me.q, me.r, q, r) <= LOOT_BAG_SEE + 1
    );
  });
}

/**
 * После своей мутации: слой и открытое окно перечитываются сразу. Окна прошлых
 * клеток (неактивные) — только помечаются: их перечитка упёрлась бы в «подойди».
 * В persist-кэше мешочков нет (lib/query.ts) — «all» здесь не нужен.
 */
export function invalidateBags(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: [BAGS_KEY], refetchType: "active" });
}

/**
 * Награда не влезла в рюкзак: тост (обычный, не глушится — мешочек ждёт
 * игрока 24 часа) и слой мешочков сразу, не дожидаясь события.
 */
export function announceDropped(
  qc: QueryClient,
  t: (key: string, params?: Record<string, string | number>) => string,
  dropped: number,
): void {
  if (!(dropped > 0)) return;
  toast.warning(t("bag.dropped", { n: formatQty(dropped) }));
  invalidateBags(qc);
}
