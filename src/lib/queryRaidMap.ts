// Ключи и инвалидация карты рейда — вынесены из query.ts (лимит 250 строк).
import type { QueryClient } from "@tanstack/react-query";
import { refetchTypeFor } from "./queryWindows";

/**
 * Ключи, которые врут после любой правки карты рейда — убил босса, админ
 * что-то разложил/снял/раскрасил, шаг рядом с невидимым беглецом.
 *
 * Собран в одном месте по тем же граблям, что и HERO_QUERY_KEYS: каждый
 * раз, когда мутация знала только «свой» ключ, а сосед оставался прежним,
 * игрок ловил либо воскресших мобов, либо пропавшие «только что» правки
 * админа — и лечил всё F5.
 *
 * Почему именно эти:
 *   beta-raid-map      — сами клетки, объекты на них, defeated, packed;
 *   beta-raid-players  — раскладка чужих + defeated/expired беглецов;
 *   beta-raid-building — окно постройки читает свежий конфиг клетки;
 *   admin-cell         — окно клетки у админа читает override поверх карты;
 *   beta-raid-ships    — снятие корабля/спавн большого корабля админом.
 */
export const RAID_MAP_KEYS = [
  "beta-raid-map",
  "beta-raid-players",
  "beta-raid-building",
  "admin-cell",
  "beta-raid-ships",
] as const;

/**
 * Перечитать всё, что зависит от состояния карты рейда.
 *
 * refetchType: "all" — обязателен по тем же причинам, что и у героя.
 * Живой пример 14.09: убитого босса «воскрешает» соседний рефетч карты
 * (SSE built/restored), потому что markCellDefeated живёт только в
 * оптимистичном патче, а сервер возвращает объект до dead-sweep. Без
 * "all" карта просто «помечена устаревшей», и persist-кэш из localStorage
 * держит вчерашнюю правду.
 */
export function invalidateRaidMap(qc: QueryClient, extra: readonly string[] = []): void {
  for (const key of [...RAID_MAP_KEYS, ...extra]) {
    // Все копии помечаем устаревшими, открытые перечитываем сразу.
    void qc.invalidateQueries({ queryKey: [key], refetchType: "active" });
    if (refetchTypeFor(key) === "active") continue;
    // Закрытые будим только у ключа-одиночки (карта, раскладка, флот). Ключ с
    // параметрами — окно «у места» (клетка, цель): его закрытые копии за сутки
    // копятся десятками, и каждый добитый моб будил их все (06.11.2026).
    void qc.refetchQueries({
      queryKey: [key],
      type: "inactive",
      predicate: (q) => q.queryKey.length === 1,
    });
  }
}
