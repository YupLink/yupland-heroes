// Открытие окна «Управление шахтами» из любого места замка (здание на площади,
// иконка у «Добычи»). Шина, как у Архитектора: общего родителя нет, окно
// живёт в полосе кнопок замка (CastleRewardRail).
const OPEN = "mine-office:open";

/**
 * Префикс ключей react-query здания: [..., "owned"] — есть ли, [..., "mines"] —
 * окно. Здесь, а не у хука замка: «шахту отняли» на карте (useHarvest) снимает
 * окно, не таща за собой модули замка.
 */
export const MINE_OFFICE_KEY = ["mine-office"] as const;

export function openMineOffice(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(OPEN));
}

/** Подписка на открытие. Возвращает отписку. */
export function onMineOfficeOpen(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(OPEN, cb);
  return () => window.removeEventListener(OPEN, cb);
}
