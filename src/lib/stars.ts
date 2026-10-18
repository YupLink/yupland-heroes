// Общие константы Telegram Stars: и клиент, и сервер берут отсюда, чтобы
// пресеты и границы не разъехались. Файл чистый — без серверных импортов,
// поэтому его безопасно тянуть в клиентский бандл.
export const STARS_TOKEN = "STARS";
/** Готовые номиналы; «своё» — любое число в границах ниже. */
export const STARS_PRESETS = [50, 100, 250, 1000] as const;
export const STARS_MIN = 1;
export const STARS_MAX = 100_000;
