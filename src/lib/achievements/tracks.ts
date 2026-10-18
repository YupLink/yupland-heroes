// Ачивки (владелец, 17.10.2026): восемь занятий, у каждого шесть редкостей —
// обычная, необычная, редкая, эпическая, легендарная, мифическая; ступеней
// внутри редкости нет. Счёт ведёт сервер по сделанному в игре. Пороги и
// награды — ЧИСЛА ВЛАДЕЛЬЦА (17.10, вечер), своих не придумывать.
import type { HeroStatKey } from "@/lib/heroStats";

/** Что растит ачивка: шесть характеристик героя плюс торговля и алхимия. */
export type AchStat = HeroStatKey | "trade" | "alchemy";

export const ACH_TRACK_IDS = [
  "lumber",
  "miner",
  "hunter",
  "digger",
  "fisher",
  "sailor",
  "explorer",
  "minelord",
] as const;

export type AchTrackId = (typeof ACH_TRACK_IDS)[number];

export type AchTrack = {
  id: AchTrackId;
  /** Сколько сделать на каждую редкость: обычная … мифическая. */
  targets: readonly [number, number, number, number, number, number];
  /** Какую характеристику растит. */
  stat: AchStat;
};

const X10 = [30, 100, 250, 750, 2000, 5000] as const;
const CELLS = [300, 600, 1500, 4500, 10000, 20000] as const;

export const ACH_TRACKS: Record<AchTrackId, AchTrack> = {
  lumber: { id: "lumber", targets: [60, 200, 500, 1500, 4000, 10000], stat: "hp" },
  miner: { id: "miner", targets: [60, 200, 500, 1500, 4000, 10000], stat: "arm" },
  hunter: { id: "hunter", targets: X10, stat: "atk" },
  digger: { id: "digger", targets: X10, stat: "luck" },
  fisher: { id: "fisher", targets: X10, stat: "alchemy" },
  /** Пройденные клетки воды на борту; клетка моря (океана) — за две. */
  sailor: { id: "sailor", targets: CELLS, stat: "spd" },
  /** Пройденные клетки пешком. */
  explorer: { id: "explorer", targets: CELLS, stat: "int" },
  minelord: { id: "minelord", targets: [100, 1000, 2500, 6000, 14000, 30000], stat: "trade" },
};

export const RARITIES = ["common", "uncommon", "rare", "epic", "legendary", "mythic"] as const;
export type Rarity = (typeof RARITIES)[number];

/** Уровень ачивки = номер редкости (1 — обычная … 6 — мифическая). */
export const MAX_STEP = RARITIES.length;

/**
 * Что даёт взятая редкость: +1 / +3 / +6 / +9 / +12 / +24 к характеристике
 * ачивки. Это итог на редкости, не сумма: необычный Рыбак — +3 алхимии.
 */
export const RARITY_BONUS = [1, 3, 6, 9, 12, 24] as const;

/** Сколько надо сделать для редкости номер step (1…6). */
export function stepTarget(track: AchTrackId, step: number): number {
  const i = Math.min(Math.max(1, Math.floor(step)), MAX_STEP) - 1;
  return ACH_TRACKS[track].targets[i];
}

/** Прибавка при взятой редкости step (0 — ничего не взято). */
export function trackBonus(step: number): number {
  return step < 1 ? 0 : RARITY_BONUS[Math.min(step, MAX_STEP) - 1];
}

/** Какая редкость взята при счёте count (0 — никакой). */
export function stepOf(track: AchTrackId, count: number): number {
  let s = 0;
  while (s < MAX_STEP && count >= stepTarget(track, s + 1)) s++;
  return s;
}

/** Редкость уровня: 1 → обычная … 6 → мифическая; 0 — никакой. */
export function rarityOf(step: number): Rarity | null {
  if (step < 1) return null;
  return RARITIES[Math.min(step, MAX_STEP) - 1];
}

export type AchCounts = Partial<Record<AchTrackId, number>>;
export type AchBonus = Partial<Record<AchStat, number>>;

/** Все прибавки аккаунта: по каждой ачивке — её взятая редкость. */
export function achievementBonus(counts: AchCounts): AchBonus {
  const out: AchBonus = {};
  for (const id of ACH_TRACK_IDS) {
    const add = trackBonus(stepOf(id, counts[id] ?? 0));
    if (add > 0) out[ACH_TRACKS[id].stat] = (out[ACH_TRACKS[id].stat] ?? 0) + add;
  }
  return out;
}

/** Счётчики из базы (jsonb «занятие → число»): мусор — ноль. */
export function parseAchCounts(raw: unknown): AchCounts {
  const out: AchCounts = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const o = raw as Record<string, unknown>;
  for (const id of ACH_TRACK_IDS) {
    const n = Number(o[id]);
    if (Number.isFinite(n) && n > 0) out[id] = Math.floor(n);
  }
  return out;
}

/**
 * Портал острова пускает, когда КАЖДОЕ занятие взяло обычную редкость:
 * владелец, 17.10 — «не пропускать раньше, чем все ачивки хотя бы на 1-2
 * уровень».
 */
export const ISLAND_GATE_STEP = 1;

export function islandGateOk(counts: AchCounts): boolean {
  return ACH_TRACK_IDS.every((id) => stepOf(id, counts[id] ?? 0) >= ISLAND_GATE_STEP);
}

/** Сколько занятий уже открыли портал. */
export function islandGateDone(counts: AchCounts): number {
  return ACH_TRACK_IDS.filter((id) => stepOf(id, counts[id] ?? 0) >= ISLAND_GATE_STEP).length;
}
