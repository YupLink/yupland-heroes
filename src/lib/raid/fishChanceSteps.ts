// Шанс попытки по её мигу (владелец, 14.10.2026, вечер: «зелье удачи действует
// только пока действует»; ПРАВИЛА §8.35 п. 6б).
//
// Шанс заброса считается при старте (база мира с бонусом героя), но временная
// удача — зелье, заклинание, храм (buff_luck) — живёт до своего срока. Поэтому
// у заброса не одно число, а ступени: с мига `at` (мс по часам базы) попытки
// идут с шансом `pct`. Попытка, чей миг раньше первой ступени, — с шансом
// заброса; не раньше ступени — с её шансом. Баффы только кончаются, поэтому
// ступени идут вниз. Нет ступеней — шанс один на весь заброс, как было.
import { fishChanceWith } from "@/lib/raid/fishBonus";
import { fishHit } from "@/lib/raid/fishing";

/** Бонус героя с мига at: истёк бафф удачи — бонус уже без него. */
export type BonusStep = { at: number; bonusPct: number };

/** Шанс попыток с мига at (мс по часам базы), %. */
export type ChanceStep = { at: number; pct: number };

/** Больше ступеней в строке не бывает: шанс сотыми от базы до 100 и только вниз. */
export const CHANCE_STEPS_MAX = 100;

const clampPct = (v: number): number => Math.min(100, Math.max(0, v));

/**
 * Шанс заброса и его ступени: база мира с бонусом сейчас, а с каждого мига
 * плана — с бонусом той ступени. Ступень, не меняющая шанса, не пишется.
 */
export function chancePlanOf(
  basePct: number,
  bonusNow: number,
  steps: readonly BonusStep[],
): { chancePct: number; steps: ChanceStep[] } {
  const chancePct = fishChanceWith(basePct, bonusNow);
  const out: ChanceStep[] = [];
  let last = chancePct;
  for (const s of [...steps].sort((a, b) => a.at - b.at)) {
    if (!Number.isFinite(s.at)) continue;
    const pct = fishChanceWith(basePct, s.bonusPct);
    if (pct === last) continue;
    out.push({ at: s.at, pct });
    last = pct;
  }
  return { chancePct, steps: out.slice(0, CHANCE_STEPS_MAX) };
}

/** Ступени из колонки chance_steps (jsonb или его текст); мусор — без ступеней. */
export function parseChanceSteps(raw: unknown): ChanceStep[] {
  let v: unknown = raw;
  if (typeof raw === "string") {
    try {
      v = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(v)) return [];
  const out: ChanceStep[] = [];
  for (const x of v) {
    const o = x && typeof x === "object" ? (x as Record<string, unknown>) : null;
    const [at, pct] = [Number(o?.at), Number(o?.pct)];
    if (Number.isFinite(at) && Number.isFinite(pct)) out.push({ at, pct: clampPct(pct) });
  }
  return out.sort((a, b) => a.at - b.at).slice(0, CHANCE_STEPS_MAX);
}

/** Шанс попытки в миг t: шанс заброса, а с каждой наступившей ступени — её. */
export function chanceAt(startPct: number, steps: readonly ChanceStep[], t: number): number {
  let pct = startPct;
  for (const s of steps) {
    if (s.at > t) break;
    pct = s.pct;
  }
  return pct;
}

/**
 * Попытки from…from+k-1 с рыбой — их номера внутри захвата, с 1. Шанс — свой у
 * каждой попытки (pctOf от её номера); при одном шансе — ровно hitOffsets.
 */
export function hitOffsetsAt(
  sid: string,
  from: number,
  k: number,
  pctOf: (n: number) => number,
): number[] {
  const out: number[] = [];
  for (let i = 1; i <= k; i++) if (fishHit(sid, from + i - 1, pctOf(from + i - 1))) out.push(i);
  return out;
}
