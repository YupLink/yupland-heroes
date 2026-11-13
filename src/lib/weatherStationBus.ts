// Открытие окна «Метеостанция» из любого места замка (здание на площади,
// иконка у «Добычи»). Шина, как у «Управления шахтами»: общего родителя нет,
// окно живёт в полосе кнопок замка (CastleRewardRail).
const OPEN = "weather-station:open";

/** Префикс ключей react-query здания: [..., "owned"] — есть ли, [..., "worlds"] — окно. */
export const WEATHER_STATION_KEY = ["weather-station"] as const;

export function openWeatherStation(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(OPEN));
}

/** Подписка на открытие. Возвращает отписку. */
export function onWeatherStationOpen(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(OPEN, cb);
  return () => window.removeEventListener(OPEN, cb);
}
