// Человеческий текст вместо системной ошибки.
//
// Во время выката новой версии сборка перезаписывается под работающим
// процессом, и на минуту-две живые вызовы падают с «Cannot find module
// …-Cf90LR2z.mjs». Игрок видел этот текст прямо в игре и решал, что сломалась
// покупка (жалоба 24.08). Такие ошибки говорят одно: «сейчас обновляемся,
// повтори через минуту» — так и пишем.
import { tFor } from "./i18n";
import { useAppStore } from "./store";

/** Признаки того, что упал не сценарий, а сам сервер во время обновления. */
const DEPLOY_MARKERS = [
  "cannot find module",
  "err_module_not_found",
  "failed to fetch dynamically imported module",
  "importing a module script failed",
  // Шлюз к базе на нашем же сервере периодически рвёт SSE-сессию, и прокси
  // отдаёт 5xx. Игроку прилетало «MCP POST 502» — техтекст, из которого не
  // понять ни что случилось, ни что делать.
  "mcp post 5",
  "mcp timeout",
  "pool is closed",
  "unable to connect",
  // Транспортный сбой server-fn: ответ без content-type / обрезанный прокси.
  // Бросает наш serverFnFetch (src/lib/serverFnTransport.ts) — до правки на
  // этом месте библиотека кидала голое «Invariant failed», и тост показывал
  // игроку именно эти два слова. Маркер — SERVER_FN_TRANSPORT_MARKER.
  "server-fn transport",
];

/**
 * Обрыв связи (14.10.2026): «Failed to fetch», «Load failed», закрытое
 * соединение — чаще всего это сеть самого игрока (3G, туннель), а не наш
 * сервер. Раньше и это называлось «Сервис обновляется», и игрок на плохой
 * связи думал, что игра вечно на ремонте. Проверяется ПОСЛЕ признаков
 * обновления: «failed to fetch dynamically imported module» — это выкатка.
 */
const NETWORK_MARKERS = [
  "load failed",
  "networkerror",
  "failed to fetch",
  "the connection was closed",
  "socket connection was closed",
];

const lang = () => useAppStore.getState().lang;
const deployText = () => tFor(lang(), "err.updating");
const offlineText = () => tFor(lang(), "err.offline");

// Отказы замка и отряда сервер бросает готовой русской фразой, а не ключом
// (serverErrorText переводит только ключи). Английский игрок закрытого теста
// читал русский тост, хотя перевод в словаре уже лежал. Пока сервер не
// переведён целиком, сопоставляем известные фразы ключам здесь: начало фразы
// стабильно, хвост у сервера бывает подробнее словарного.
const SERVER_PHRASE_KEYS: Array<[RegExp, string]> = [
  [/^это делается в замке/, "braid.castle_only"],
  [/^отряд героя разбежался/, "braid.squad_gone"],
  [/^весь отряд сейчас недоступен/, "braid.squad_all_busy"],
  [/^снаряжение героя пока недоступно/, "braid.gear_locked"],
  // Отказ базы: изношенный инструмент из рюкзака не уходит (CHECK, §8.19) —
  // любым путём, что не ловит его сам (сундук, раздача), вместо текста SQL.
  [/raid_hero_backpack_worn_stays/, "braid.tool_worn_stays"],
];

/**
 * Ключ словаря вместо фразы: домен, точка, имя («braid.void_blocked»).
 *
 * Новые серверные отказы бросаются уже ключом (voidGate), и тот же договор
 * держит serverErrorText. Но половина экранов зовёт humanError напрямую, и
 * там ключ доезжал до тоста как есть — игрок читал «braid.void_blocked».
 * Обычная фраза под шаблон не подходит: в ней есть пробелы.
 */
const KEY_RE = /^[a-z][a-z0-9]*\.[a-z0-9_]+$/i;

function translateKey(raw: string): string | null {
  if (!KEY_RE.test(raw)) return null;
  const text = tFor(useAppStore.getState().lang, raw);
  // t() отдаёт сам ключ, когда его нет в словаре — значит это была фраза.
  return text === raw ? null : text;
}

/** Перевод известной серверной фразы. Язык берём из стора: humanError зовут
 *  из обработчиков ошибок, не из рендера, поэтому хук здесь не нужен. */
function translateServerPhrase(low: string): string | null {
  const hit = SERVER_PHRASE_KEYS.find(([re]) => re.test(low));
  if (!hit) return null;
  return tFor(useAppStore.getState().lang, hit[1]);
}

/**
 * Ключ с числами: `market.backpack_need:<нужно>:<свободно>`. Обычный ключ
 * параметров не носит, а игроку важно не «полно», а «освободи столько-то».
 */
function translateNeedKey(raw: string): string | null {
  const m = /^([a-z][a-z0-9]*\.[a-z0-9_]+):(\d+):(\d+)$/i.exec(raw);
  if (!m) return null;
  const text = tFor(useAppStore.getState().lang, m[1], { need: m[2], free: m[3] });
  return text === m[1] ? null : text;
}

/**
 * Ключ с подстановками: `braid.need_energy|{"n":2}` — тот же договор, что у
 * serverErrorText (энергия за «Открыть» и лопату, §8.23).
 */
function translateParamKey(raw: string): string | null {
  const bar = raw.indexOf("|");
  if (bar <= 0 || !KEY_RE.test(raw.slice(0, bar))) return null;
  try {
    const params = JSON.parse(raw.slice(bar + 1)) as Record<string, string | number>;
    const text = tFor(useAppStore.getState().lang, raw.slice(0, bar), params);
    return text === raw.slice(0, bar) ? null : text;
  } catch {
    return null;
  }
}

/** Текст ошибки для игрока: свой понятный или общий про обновление. */
export function humanError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e ?? "");
  const low = raw.toLowerCase();
  if (DEPLOY_MARKERS.some((m) => low.includes(m))) return deployText();
  if (NETWORK_MARKERS.some((m) => low.includes(m))) return offlineText();
  const withNums = translateNeedKey(raw.trim()) ?? translateParamKey(raw.trim());
  if (withNums) return withNums;
  const byKey = translateKey(raw.trim());
  if (byKey) return byKey;
  const known = translateServerPhrase(low.trim());
  if (known) return known;
  // Пустая или чисто техническая ошибка игроку ничего не объясняет.
  if (!raw.trim() || low.startsWith("internal server error")) return deployText();
  return raw;
}
