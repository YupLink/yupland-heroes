// Окно постройки получило вид extra.kind, которого эта страница не знает: сервер
// уже выкатил новую постройку, а игрок давно не перезагружал игру. Запасной блок
// тогда рисовал чужое («Осмотреть округу на undefined клеток»). Теперь страница
// запоминает, какое окно было открыто, тихо перезагружается и после загрузки карты
// сама открывает это окно уже новым кодом (владелец, 28.10.2026: «хочу, чтобы
// сразу же у них всё было доступно»).
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { BuildingExtra } from "@/lib/buildingEffect";
import { reloadQuietly } from "@/lib/staleReload";

type Kind = NonNullable<BuildingExtra>["kind"];
type Cell = { q: number; r: number };

/**
 * Виды, которые этот клиент умеет рисовать. Record по союзу BuildingExtra: новый
 * вид без строки здесь (или лишняя строка) — ошибка tsc, список не отстанет.
 */
const KNOWN: Record<Kind, true> = {
  shipyard: true,
  leveltree: true,
  sign: true,
  tavern: true,
  watchtower: true,
  warehouse: true,
  field: true,
  mine: true,
  portal: true,
  university: true,
  museum: true,
  tournament: true,
  casino: true,
  buckwheat: true,
  enchant: true,
  hero_enchant: true,
  art_gen: true,
  boost: true,
  chambers: true,
  spellbook: true,
  oblivion: true,
  town_hall: true,
  market: true,
};
const KNOWN_KINDS = new Set<string>(Object.keys(KNOWN));

export function isKnownExtraKind(kind: string): boolean {
  return KNOWN_KINDS.has(kind);
}

/** Ключ карты в кэше — тот же, что у useMapProgressive (MAP_KEY). */
const MAP_KEY = ["beta-raid-map"];
const INTENT_KEY = "reopen-building";
const RELOAD_KEY = "unknown-extra-reload-at";
/** Защита от петли: из-за незнакомого вида — не чаще раза в минуту. */
export const UNKNOWN_RELOAD_GAP_MS = 60_000;
/** Намерение «открыть окно» живёт две минуты: позже это уже другой заход в игру. */
export const REOPEN_TTL_MS = 2 * 60_000;

function forget(): void {
  try {
    sessionStorage.removeItem(INTENT_KEY);
  } catch {
    /* приватный режим — нечего стирать */
  }
}

/**
 * Вид незнакомый — запомнить окно {mapId, q, r, at} и тихо перезагрузиться.
 * true — перезагрузка пошла; false — вид знакомый или защита от петли не пустила.
 */
export function reloadIfUnknownKind(
  kind: string | undefined,
  at: Cell & { mapId: string | null },
): boolean {
  if (kind === undefined || isKnownExtraKind(kind)) return false;
  if (at.mapId) {
    try {
      const intent = { mapId: at.mapId, q: at.q, r: at.r, at: Date.now() };
      sessionStorage.setItem(INTENT_KEY, JSON.stringify(intent));
    } catch {
      /* без отметки перезагрузимся, но окно не откроется само */
    }
  }
  if (reloadQuietly(RELOAD_KEY, UNKNOWN_RELOAD_GAP_MS)) return true;
  forget(); // перезагрузки не будет — и открывать потом нечего
  return false;
}

/** Окно, ради которого перезагрузились: свежее и на этой карте. Читается один раз — сразу стирается. */
export function takeReopenIntent(mapId: string): Cell | null {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(INTENT_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;
  forget();
  try {
    const it = JSON.parse(raw) as Partial<Cell & { mapId: string; at: number }>;
    const age = Date.now() - Number(it.at);
    if (!(age >= 0 && age <= REOPEN_TTL_MS) || it.mapId !== mapId) return null;
    if (typeof it.q !== "number" || typeof it.r !== "number") return null;
    return { q: it.q, r: it.r };
  } catch {
    return null;
  }
}

/** Окно постройки: незнакомый вид — перезагрузка и потом это же окно. */
export function useReloadOnUnknownExtra(extra: BuildingExtra, q: number, r: number): void {
  const qc = useQueryClient();
  const kind = extra?.kind;
  useEffect(() => {
    const map = qc.getQueryData<{ map?: { id: string } | null }>(MAP_KEY);
    reloadIfUnknownKind(kind, { mapId: map?.map?.id ?? null, q, r });
  }, [kind, q, r, qc]);
}

/** Карта загрузилась: открыть окно, ради которого перезагрузились, — тем же openBuilding, что и тап. */
export function useReopenBuilding(mapId: string | undefined, open: (cell: Cell) => void): void {
  useEffect(() => {
    if (!mapId) return;
    const cell = takeReopenIntent(mapId);
    if (cell) open(cell);
  }, [mapId, open]);
}
