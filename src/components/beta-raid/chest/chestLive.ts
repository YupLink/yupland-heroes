// Живой поток и сундуки: какие ключи перечитать на событие 'built'.
//
// 'built' шлют ~20 серверных путей (стройка, шахты, поля, двери…), и почти все
// они — про клетку с постройкой. Сундук стоит там, где постройки нет, поэтому
// слой сундуков перечитываем, только если событие задело известный сундук или
// клетку без постройки (так приходит новый сундук). Без гейта каждый чужой тир
// где-то на карте стоил бы запроса всем онлайн.
import type { QueryClient } from "@tanstack/react-query";
import type { ChestMarks } from "@/lib/magicChest";
import { readCellDetails, type MapLike } from "@/components/beta-raid/patchMapCache";

export const CHESTS_KEY = ["beta-magic-chests"] as const;
export const CHEST_NET_KEY = "beta-chest-net";
/** Охрана чужого сундука (окно боя): HP, хозяин, «открыт мне». */
export const CHEST_GUARD_KEY = "beta-chest-guard";
/** Цифры «Забрать сундук» для подтверждения последнего сундука. */
export const CHEST_PICKUP_KEY = "beta-chest-pickup";
/** Окно «Добыча» и цифра на кружке (useHarvest): захват кладёт туда добычу. */
export const HARVEST_LIVE_KEY = "beta-raid-harvest";

/** Магические сундуки, которые знает слой карты этого игрока. */
const knownChests = (qc: QueryClient): ChestMarks | undefined =>
  qc.getQueryData<{ chests: ChestMarks }>(CHESTS_KEY)?.chests;

/** Обычные сундуки слоя (поле plain; у ответа прошлой версии его нет). */
const knownPlain = (qc: QueryClient): ChestMarks | undefined =>
  qc.getQueryData<{ plain?: ChestMarks }>(CHESTS_KEY)?.plain;

/** Задело ли событие сундук: известный, новый (клетка без постройки) или не знаем. */
export function chestCellsTouched(qc: QueryClient, cells: readonly string[]): boolean {
  if (cells.length === 0) return true;
  const chests = knownChests(qc);
  if (chests && cells.some((key) => key in chests)) return true;
  const plain = knownPlain(qc);
  if (plain && cells.some((key) => key in plain)) return true;
  const map = qc.getQueryData(["beta-raid-map"]) as MapLike | undefined;
  if (!map?.packed) return true;
  return cells.some((key) => {
    const [q, r] = key.split(",").map(Number);
    if (!Number.isFinite(q) || !Number.isFinite(r)) return false;
    return readCellDetails(map, q, r).buildingId == null;
  });
}

/**
 * Что перечитать после 'built'. Окна сундука (сеть, охрана, цифры «Забрать»)
 * живы, только пока открыты, — их инвалидация без гейта ничего не стоит. Слой
 * карты — за гейтом выше. «Добыча» висит на кружке всегда: её перечитываем,
 * только когда задет известный ЧУЖОЙ сундук (захват кладёт добычу чужаку) —
 * так второе устройство победителя увидит её без F5, а стройка шахт и дела
 * хозяина со своим сундуком мимо не бьют.
 */
export function chestLiveKeys(qc: QueryClient, cells: readonly string[]): string[] {
  const keys = [CHEST_NET_KEY, CHEST_GUARD_KEY, CHEST_PICKUP_KEY];
  if (chestCellsTouched(qc, cells)) keys.push(CHESTS_KEY[0]);
  const chests = knownChests(qc);
  if (chests && cells.some((key) => chests[key]?.mine === false)) keys.push(HARVEST_LIVE_KEY);
  return keys;
}

/** После своей мутации: слой карты и окна сундука — с refetchType 'all', как рюкзак. */
export function invalidateChests(qc: QueryClient): void {
  for (const key of [CHESTS_KEY[0], CHEST_NET_KEY, CHEST_GUARD_KEY, CHEST_PICKUP_KEY]) {
    void qc.invalidateQueries({ queryKey: [key], refetchType: "all" });
  }
}
