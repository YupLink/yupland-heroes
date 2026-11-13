// Открытие окна «Хижина шаманов» из любого места замка (здание на площади,
// иконка у «Добычи»). Шина, как у «Метеостанции»: общего родителя нет, окно
// живёт в полосе кнопок замка (CastleRewardRail).
const OPEN = "shaman-hut:open";

/** Префикс ключей react-query хижины: [..., "owned"] — есть ли, [..., "view"] — окно. */
export const SHAMAN_HUT_KEY = ["shaman-hut"] as const;

export function openShamanHut(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(OPEN));
}

/** Подписка на открытие. Возвращает отписку. */
export function onShamanHutOpen(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(OPEN, cb);
  return () => window.removeEventListener(OPEN, cb);
}
