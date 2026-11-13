// Доля владельцев казино (владелец, 09.11.2026, ПРАВИЛА §8.124): раз в сутки 5 %
// прибыли казино — поровну на всех героев со способностью «Владелец казино».
// Убыток переносится долгом: 5 % — только с прибыли сверх него. Считает база
// (migrations/casino-share-01.sql), доля встаёт строкой «Казино» в «Добычу».

/** Сколько процентов прибыли дня уходит владельцам. */
export const CASINO_SHARE_PCT = 5;

/** Первые сутки МСК, которые подводятся (долг — с нуля). */
export const CASINO_SHARE_START = "2026-11-09";

/** Способность героя (lib/hero/heroAbilities). */
export const CASINO_OWNER_ABILITY = "casino_owner";

/** Вид строки «Добычи»; он же подпись источника (harvest.source.casino_share). */
export const CASINO_SHARE_KIND = "casino_share";

/** location_id строки «Добычи»: доля не привязана к карте. */
export const CASINO_SHARE_LOCATION = "casino";

/** Отказ «пока не вышло»: строка остаётся в «Добыче» (SOFT_GRANT_ERRORS). */
export const CASINO_SHARE_LATER = "casino.share_later";

/** pack_id строки «Добычи»: «<день>:<герой>». */
export const casinoShareRef = (day: string, heroId: string): string => `${day}:${heroId}`;

/** Разбор pack_id; мусор — null. */
export function parseCasinoShareRef(ref: string): { day: string; heroId: string } | null {
  const m = /^(\d{4}-\d{2}-\d{2}):(.+)$/.exec(ref);
  return m ? { day: m[1], heroId: m[2] } : null;
}

/** Ключ выдачи (строка очереди и движение золота): «cshare:<день>:<герой>». */
export const casinoShareKey = (day: string, heroId: string): string =>
  `cshare:${casinoShareRef(day, heroId)}`;
