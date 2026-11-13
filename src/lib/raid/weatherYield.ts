// Выход «в час» с погодой (владелец, 28.10.2026): «когда погода ухудшает параметры,
// тут нужно писать сколько с учётом ухудшения, + значок погоды». Число — базовое ×
// коэффициент той карты, где стоит постройка (coefs из getRaidWeather — уже
// применяемые: влияние выключено, остров — все 1). Шахты v2 — «mine», поля — «farm»;
// грибы и шахты старого образца погода не трогает (ПРАВИЛА §8.83). Коэффициент 1 —
// число прежнее и без значка.
//
// Чистые функции: окно «Добыча», окно поля, окно шахты считают одинаково.
import type { WeatherCoefs, WeatherKind } from "@/lib/raid/weather";
import { harvestSourceRate } from "@/lib/harvestSourceGroups";
import type { MineRow } from "@/server/api/beta-raid/mine-pendings";

/** Погода карты для показа: значок и применяемые сейчас коэффициенты. */
export type MapWeatherShown = { kind: WeatherKind; coefs: WeatherCoefs };
export type WeatherByMap = ReadonlyMap<string, MapWeatherShown>;

/** Ответ getRaidWeather — то, что нужно для показа. */
type WeatherReply = { mapId: string; kind: WeatherKind; nextAt: number; coefs: WeatherCoefs };

/** Сколько значков погоды в заголовке группы, не больше. */
export const GROUP_WEATHER_ICONS = 2;

/** До 0,0001 — как выплаты шахт v2: без хвостов 0,30000000000000004. */
const round4 = (n: number): number => Math.round(n * 10_000) / 10_000;

/**
 * Погода по картам из ответов сервера: только свежие (слот ещё не сменился) и той
 * же карты. Нет ответа, сбой, остров — карты нет, число без погоды.
 */
export function weatherByMapOf(
  replies: ReadonlyArray<WeatherReply | null | undefined>,
  now: number,
): WeatherByMap {
  const out = new Map<string, MapWeatherShown>();
  for (const w of replies) {
    if (!w || !(Number(w.nextAt) > now)) continue;
    out.set(w.mapId, { kind: w.kind, coefs: w.coefs });
  }
  return out;
}

/** Число с погодой и значок; коэффициент 1 или число 0 — прежнее, без значка. */
export function weatherShown(
  base: number,
  coef: number | null | undefined,
  kind: WeatherKind | null | undefined,
): { value: number; kind: WeatherKind | null } {
  if (!kind || coef == null || !Number.isFinite(coef) || coef === 1 || !(base > 0)) {
    return { value: base, kind: null };
  }
  return { value: round4(base * Math.max(0, coef)), kind };
}

/** Шахта, которую погода касается: v2 (не гриб и не старого образца). */
export const mineFeelsWeather = (mine: Pick<MineRow, "mushroom" | "v2">): boolean =>
  !mine.mushroom && !!mine.v2;

/** Выход шахты в час с погодой её карты. */
export function mineShownRate(
  mine: MineRow,
  now: number,
  weather: WeatherByMap,
): { value: number; kind: WeatherKind | null } {
  const base = harvestSourceRate(mine, now);
  const w = mineFeelsWeather(mine) ? weather.get(mine.mapId) : undefined;
  return weatherShown(base, w?.coefs.mine, w?.kind);
}

/**
 * Сводка группы: шахты могут стоять на разных картах — каждая со своим
 * коэффициентом. Значки — у кого погода изменила выход, по разу на вид, не
 * больше двух.
 */
export function groupShownRate(
  rows: readonly MineRow[],
  now: number,
  weather: WeatherByMap,
): { value: number; kinds: WeatherKind[] } {
  let value = 0;
  const kinds: WeatherKind[] = [];
  for (const mine of rows) {
    const shown = mineShownRate(mine, now, weather);
    value += shown.value;
    if (shown.kind && !kinds.includes(shown.kind) && kinds.length < GROUP_WEATHER_ICONS) {
      kinds.push(shown.kind);
    }
  }
  return { value: round4(value), kinds };
}

/** Доля поля в час с погодой его карты («фермы»). */
export function fieldShownRate(
  field: { mapId: string; perHour: number },
  weather: WeatherByMap,
): { value: number; kind: WeatherKind | null } {
  const w = weather.get(field.mapId);
  return weatherShown(field.perHour, w?.coefs.farm, w?.kind);
}

/** Карты, чья погода нужна списку: шахты v2 и поля. */
export function weatherMapIds(
  mines: readonly MineRow[],
  fields: ReadonlyArray<{ mapId: string }>,
): string[] {
  const ids = new Set<string>();
  for (const m of mines) if (mineFeelsWeather(m) && !m.lost) ids.add(m.mapId);
  for (const f of fields) ids.add(f.mapId);
  return [...ids].sort();
}
