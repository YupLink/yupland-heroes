// Отнятые шахты и грибы (владелец, 23.10.2026): несобранное прежнего хозяина
// не ложится на счёт — отнятая шахта стоит обычной строкой в списке шахт
// «Добычи» и собирается «Собрать со всех шахт»; собрал — строка ушла.
//
// Уведомление (тост в игре и письмо игрового бота) — только что случилось и
// клетка (владелец: «шахту захватили и координаты — больше ничего писать не
// нужно — краткость и лаконичность»). Несколько — по строке на каждую. Кто
// отнял — не бывает здесь вовсе («Нельзя говорить, кто захватил шахту»).
import { livePendingAmount } from "@/lib/minePending";
import type { MineWeather } from "@/lib/mineWeather";
import { isMushroomKind, mushroomKindOf, type MushroomKind } from "@/lib/mushroomKinds";

/** Что случилось: захватили, подняли гриб, сломалась, разобрали, гриб сгнил, остров закрыт,
 *  синий динамит снизил уровень шахты (§8.75а: прошедшее по старому уровню — к сбору). */
export const MINE_LOST_KINDS = [
  "capture",
  "take",
  "break",
  "dismantle",
  "expire",
  "island",
  "level",
] as const;
export type MineLostKind = (typeof MINE_LOST_KINDS)[number];

export const lostKindOf = (v: unknown): MineLostKind =>
  (MINE_LOST_KINDS as readonly unknown[]).includes(v) ? (v as MineLostKind) : "capture";

/**
 * Одна потеря для уведомления: что и где; у гриба (подняли, сгнил) — его вид
 * (игрок 25.10: «какой гриб»). С 04.11 (владелец, §8.106) — ещё вид шахты
 * (resource: «Каменную шахту захватили») и мир (world: «— Асгард»); id —
 * строка журнала, на неё ведёт кнопка «Показать» письма.
 */
export type MineLostNote = {
  kind: MineLostKind;
  q: number;
  r: number;
  mushroom?: MushroomKind;
  id?: string;
  resource?: string;
  world?: string;
};

/** Потеря гриба (подняли, сгнил): у шахт вид гриба не пишем. */
const MUSHROOM_LOSS: readonly MineLostKind[] = ["take", "expire"];

/**
 * Вид гриба по строке журнала (resource, token — как в настройке клетки):
 * золотой — gold, алмазный — diamonds, DARAI — token Darai. Не гриб — null.
 */
export function lostMushroomOf(
  kind: MineLostKind,
  resource: unknown,
  token: unknown,
): MushroomKind | null {
  if (!MUSHROOM_LOSS.includes(kind)) return null;
  if (resource === "gold" || resource === "diamonds") return resource;
  return mushroomKindOf({ resource, token });
}

/** Метка строки «Добычи»: отнятая шахта — «отнята», понижение уровня — «уровень снижен». */
export const lostMarkKey = (kind: unknown): string =>
  kind === "level" ? "minelost.mark.level" : "minelost.mark";

/** Пачка игрока: всего потерь и строки (не больше LOST_NOTE_LINES). */
export type MineLostDigest = { count: number; notes: MineLostNote[] };

/** Строк в одном уведомлении; больше — «…» (письмо бота и событие канала не безразмерны). */
export const LOST_NOTE_LINES = 50;

export type Tr = (key: string, params?: Record<string, string | number>) => string;

export function lostDigest(notes: readonly MineLostNote[]): MineLostDigest {
  return { count: notes.length, notes: notes.slice(0, LOST_NOTE_LINES) };
}

/** Шахты v2 со своим именем; прочее (DARAI, энергия) — просто «шахта». */
const MINE_WORDS = ["wood", "stone", "gold", "diamonds"] as const;

/** Что случилось, без места: «Каменную шахту захватили», «Золотой гриб подняли». */
export function lostCore(t: Tr, n: Pick<MineLostNote, "kind" | "mushroom" | "resource">): string {
  if (MUSHROOM_LOSS.includes(n.kind)) {
    return t(`minelost.say.${n.kind}${n.mushroom ? `.${n.mushroom}` : ""}`);
  }
  const w = (MINE_WORDS as readonly unknown[]).includes(n.resource) ? n.resource : "any";
  return t(`minelost.say.${n.kind}`, {
    acc: t(`minelost.acc.${w}`),
    nom: t(`minelost.nom.${w}`),
    dat: t(`minelost.dat.${w}`),
  });
}

/** Место: «Асгард (12, 34)», без мира — «(12, 34)». */
export const lostPlace = (n: { q: number; r: number; world?: string | null }): string =>
  `${n.world ? `${n.world} ` : ""}(${n.q}, ${n.r})`;

/** «Каменную шахту захватили — Асгард (12, 34)» — по строке на каждую потерю. */
export function lostText(t: Tr, d: MineLostDigest): string {
  const lines = d.notes.map((n) => `${lostCore(t, n)}${n.world ? " —" : ""} ${lostPlace(n)}`);
  if (d.count > d.notes.length) lines.push("…");
  return lines.join("\n");
}

const numOf = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Пачка из живого канала (чужой формат — null): клиент не верит полям на слово. */
export function digestOf(v: unknown): MineLostDigest | null {
  if (!v || typeof v !== "object") return null;
  const o = v as { count?: unknown; notes?: unknown };
  const notes = (Array.isArray(o.notes) ? o.notes : []).slice(0, LOST_NOTE_LINES).map((x) => {
    const n = (x ?? {}) as Record<string, unknown>;
    const note: MineLostNote = {
      kind: lostKindOf(n.kind),
      q: Math.trunc(numOf(n.q)),
      r: Math.trunc(numOf(n.r)),
    };
    if (isMushroomKind(n.mushroom)) note.mushroom = n.mushroom;
    for (const k of ["id", "resource", "world"] as const) {
      const v = n[k];
      if (typeof v === "string" && v) note[k] = v.slice(0, 120);
    }
    return note;
  });
  if (notes.length === 0) return null;
  return { count: Math.max(notes.length, Math.floor(numOf(o.count))), notes };
}

/** Строка шахты «Добычи»: своя — живой счёт, отнятая — сумма её строки журнала. */
export type HarvestMineLike = {
  capturedAt: number;
  claimedHours: number;
  yield: number;
  maxHours: number | null;
  stepHours?: number;
  /** Шахта v2: слоты погоды несобранной части (lib/mineWeather); нет — без погоды. */
  weather?: MineWeather | null;
  /** Отнятая шахта или гриб: строка журнала и сколько ждёт сбора. */
  lost?: { id: string; amount: number } | null;
};

/** Сколько готово к сбору у строки шахты «Добычи». */
export function mineRowReady(m: HarvestMineLike, now = Date.now()): number {
  if (m.lost) return m.lost.amount > 0 ? m.lost.amount : 0;
  return livePendingAmount(
    m.capturedAt,
    m.claimedHours,
    m.yield,
    now,
    m.maxHours,
    m.stepHours,
    m.weather,
  );
}
