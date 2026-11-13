// Ачивки (владелец, 17.10.2026): восемь занятий, у каждого шесть редкостей —
// обычная, необычная, редкая, эпическая, легендарная, мифическая; ступеней
// внутри редкости нет. Счёт ведёт сервер по сделанному в игре. Пороги и
// награды — ЧИСЛА ВЛАДЕЛЬЦА (17.10, вечер), своих не придумывать.
import type { HeroStatKey } from "@/lib/heroStats";
import { REF_FRIEND_TIERS, REF_SPEND_TIERS, REF_TIER_PCTS } from "@/lib/referralGold";

/**
 * Что растит ачивка: шесть характеристик героя плюс торговля и алхимия; refpct —
 * не герою: доля пригласившего с покупок друзей, % (рефка золотом, §8.101).
 */
export type AchStat = HeroStatKey | "trade" | "alchemy" | "refpct";

export const ACH_TRACK_IDS = [
  "lumber",
  "miner",
  "hunter",
  "digger",
  "fisher",
  "sailor",
  "explorer",
  "minelord",
  "gambler",
  "friends",
  "friendbuy",
] as const;

export type AchTrackId = (typeof ACH_TRACK_IDS)[number];

/** Занятия острова новичка (портал острова и список на острове): без казино и друзей. */
export const ISLAND_TRACK_IDS: readonly AchTrackId[] = ACH_TRACK_IDS.filter(
  (id) => id !== "gambler" && id !== "friends" && id !== "friendbuy",
);

export type AchTrack = {
  id: AchTrackId;
  /** Сколько сделать на каждую редкость: обычная … мифическая. */
  targets: readonly [number, number, number, number, number, number];
  /** Какую характеристику растит. */
  stat: AchStat;
  /** false — награда ещё не включена (владелец решит): счёт и редкость идут, прибавки нет. */
  active?: boolean;
  /** Своя лестница наград вместо RARITY_BONUS (итог на редкости). */
  bonuses?: readonly [number, number, number, number, number, number];
};

const X10 = [30, 100, 250, 750, 2000, 5000] as const;
const CELLS = [300, 600, 1500, 4500, 10000, 20000] as const;

export const ACH_TRACKS: Record<AchTrackId, AchTrack> = {
  lumber: { id: "lumber", targets: [60, 200, 500, 1500, 4000, 10000], stat: "hp" },
  miner: { id: "miner", targets: [60, 200, 500, 1500, 4000, 10000], stat: "arm" },
  hunter: { id: "hunter", targets: X10, stat: "atk" },
  /**
   * Копка лопатой (с 08.11 — и земля с находкой): владелец 08.11 — мифическая 15 000,
   * легендарная ×2, эпическая ×1,5 от прежних 2 000 и 750.
   */
  digger: { id: "digger", targets: [30, 100, 250, 1125, 4000, 15000], stat: "luck" },
  fisher: { id: "fisher", targets: X10, stat: "alchemy" },
  /** Пройденные клетки воды на борту; клетка моря (океана) — за две. */
  sailor: { id: "sailor", targets: CELLS, stat: "spd" },
  /** Пройденные клетки пешком. */
  explorer: { id: "explorer", targets: CELLS, stat: "int" },
  /** Собранное с шахт, шт.; DARAI — очко за 1 000 (achievements/minelord). */
  minelord: { id: "minelord", targets: [100, 1000, 2500, 6000, 14000, 30000], stat: "trade" },
  /**
   * «Лудоман» (владелец, 21.10.2026): оборот в казино — сколько золота поставлено
   * в автомате. Пороги — 10к/50к/100к/500к ×3 и 1 млн/5 млн ×10. Награда
   * +1…+24 удачи — включена (21.10: «включай все»).
   */
  gambler: {
    id: "gambler",
    targets: [30_000, 150_000, 300_000, 1_500_000, 10_000_000, 50_000_000],
    stat: "luck",
  },
  /**
   * «Много друзей» (рефка золотом, Ярослав 31.10 / владелец 02.11): друзья, что
   * потратили в игре от $10 — 1/3/5/10/50/100 → торговля +1…+24.
   */
  friends: { id: "friends", targets: REF_FRIEND_TIERS, stat: "trade" },
  /**
   * «Покупки друзей»: сколько золота купили все друзья (подписка — $1 = 1 000) —
   * доля пригласившего 11/12/14/16/18/20 % (без ачивки — 10 %).
   */
  friendbuy: { id: "friendbuy", targets: REF_SPEND_TIERS, stat: "refpct", bonuses: REF_TIER_PCTS },
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

/** Прибавка при взятой редкости step (0 — ничего не взято); у ачивки бывает своя лестница. */
export function trackBonus(step: number, track?: AchTrackId): number {
  const ladder = (track && ACH_TRACKS[track].bonuses) || RARITY_BONUS;
  return step < 1 ? 0 : ladder[Math.min(step, MAX_STEP) - 1];
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
    if (ACH_TRACKS[id].active === false || ACH_TRACKS[id].stat === "refpct") continue;
    const add = trackBonus(stepOf(id, counts[id] ?? 0), id);
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
  return ISLAND_TRACK_IDS.every((id) => stepOf(id, counts[id] ?? 0) >= ISLAND_GATE_STEP);
}

/** Сколько занятий уже открыли портал. */
export function islandGateDone(counts: AchCounts): number {
  return ISLAND_TRACK_IDS.filter((id) => stepOf(id, counts[id] ?? 0) >= ISLAND_GATE_STEP).length;
}
