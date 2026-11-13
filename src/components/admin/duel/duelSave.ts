// Бой переживает перезагрузку (владелец 09.11.2026: «ещё и перезагрузилась страница»):
// страница тихо обновляется на новую версию, когда игрок свернул её или задумался
// (lib/versionCheck), — песочница помнит расклад и сам бой во вкладке
// (sessionStorage) и продолжает с того же хода. Хранилище недоступно — просто без памяти.
import type { DuelState } from "@/lib/duel/types";
import type { Spots } from "./armySpots";

// v3 — гексы, как на карте (09.11.2026): бой с квадратного поля не подхватывать.
const KEY = "duel-sandbox:v3";

export type DuelSave = { seed: number; army: string[]; spots: Spots; st: DuelState | null };

const okState = (v: unknown): v is DuelState => {
  const s = v as DuelState | null;
  return !!s && Array.isArray(s.units) && Array.isArray(s.order) && typeof s.turn === "number";
};

export function loadDuel(): DuelSave | null {
  try {
    const raw = typeof sessionStorage === "undefined" ? null : sessionStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<DuelSave>;
    if (typeof v.seed !== "number" || !Array.isArray(v.army)) return null;
    return {
      seed: v.seed,
      army: v.army.filter((x): x is string => typeof x === "string").slice(0, 4),
      spots: v.spots && typeof v.spots === "object" ? v.spots : {},
      st: okState(v.st) ? v.st : null,
    };
  } catch {
    return null;
  }
}

export function saveDuel(patch: Partial<DuelSave>): void {
  try {
    const cur = loadDuel() ?? { seed: 0, army: [], spots: {}, st: null };
    sessionStorage.setItem(KEY, JSON.stringify({ ...cur, ...patch }));
  } catch {
    /* без памяти: приватный режим, квота */
  }
}
