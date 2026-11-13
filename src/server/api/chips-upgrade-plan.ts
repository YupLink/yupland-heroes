// chips-upgrade-plan — планировщик улучшения фишки (автоподбор), без базы.
//
// Один код на два места: кнопка «Улучшить» (chips-craft-upgrade — превью и
// само улучшение) и пакетная проверка «можно ли улучшить» для списка фишек
// (chips-upgrade-ready). Правила — CRAFT_RULES; сюда приходят уже прочитанные
// фишки, баланс золота и множитель цены (один на весь план: каждый шаг —
// стандарт × множитель, вверх до целого, как при крафте по одному).
import { levelKey } from "./chips-mint-helpers";
import { CRAFT_RULES } from "./chips-craft";
import { goldAtMultiplier } from "@/lib/craftGold";

export type PlanChip = { id: string; level: number; template: string; serial: number | null };
/** gold — цена шага в золоте (в базу не уходит: auto_craft_chip_atomic получает cost = 0). */
export type PlanStep = {
  out: string;
  base: string;
  sacs: string[];
  gold: number;
  src_level: number;
  sac_level: number;
  identical: boolean;
};

export const lvlEq = (a: number, b: number) => Math.abs(a - b) < 0.001;

/** Планировщик тащит через рекурсию не только счётчик имён, но и ПРИЧИНУ
 *  провала: без неё «не собралось» доходило до игрока пустой строкой. */
type PlanCtx = { n: number; mult: number; miss?: { level: number; identical: boolean } };
export type MissReason = { kind: "same_type"; level: number } | { kind: "chips" };

export function acquireChip(
  pool: PlanChip[],
  level: number,
  tmpl: string | null,
  ctx: PlanCtx,
): { chip: PlanChip; pool: PlanChip[]; steps: PlanStep[]; gold: number } | null {
  const idx = pool.findIndex((c) => lvlEq(c.level, level) && (!tmpl || c.template === tmpl));
  if (idx >= 0) {
    return {
      chip: pool[idx],
      pool: pool.slice(0, idx).concat(pool.slice(idx + 1)),
      steps: [],
      gold: 0,
    };
  }
  if (level <= 1.0001) return null;
  const R = CRAFT_RULES[levelKey(level - 0.5)];
  if (!R) return null;
  const b = acquireChip(pool, level - 0.5, tmpl, ctx);
  if (!b) return null;
  const baseTemplate = b.chip.template;
  const sacLevel = R.sacrificeLevel ?? level - 0.5;
  const sacTmpl = R.requireIdentical ? baseTemplate : null;
  let curPool = b.pool;
  const steps = [...b.steps];
  let gold = b.gold;
  const sacs: PlanChip[] = [];
  for (let i = 0; i < R.sacrifices; i++) {
    const s = acquireChip(curPool, sacLevel, sacTmpl, ctx);
    if (!s) {
      if (sacTmpl && !ctx.miss) ctx.miss = { level: sacLevel, identical: true };
      return null;
    }
    curPool = s.pool;
    steps.push(...s.steps);
    gold += s.gold;
    sacs.push(s.chip);
  }
  const outLabel = "v" + ctx.n++;
  const stepGold = goldAtMultiplier(R.costGold, ctx.mult);
  steps.push({
    out: outLabel,
    base: b.chip.id,
    sacs: sacs.map((c) => c.id),
    gold: stepGold,
    src_level: level - 0.5,
    sac_level: sacLevel,
    identical: R.requireIdentical,
  });
  gold += stepGold;
  return {
    chip: { id: outLabel, level, template: baseTemplate, serial: b.chip.serial },
    pool: curPool,
    steps,
    gold,
  };
}

/** Чего не хватает по счёту фишек; gold — золото по стандарту на всё недостающее. */
export function countShortfall(
  have: Record<string, number>,
  topLevel: number,
): { shortfall: Record<string, number>; gold: number } {
  const h: Record<string, number> = { ...have };
  const short: Record<string, number> = {};
  let gold = 0;
  function need(level: number, n: number) {
    if (n <= 0) return;
    const key = levelKey(level);
    const avail = h[key] ?? 0;
    const use = Math.min(n, avail);
    h[key] = avail - use;
    const rem = n - use;
    if (rem === 0) return;
    if (level <= 1.0001) {
      short["1"] = (short["1"] ?? 0) + rem;
      return;
    }
    const R = CRAFT_RULES[levelKey(level - 0.5)];
    if (!R) {
      short[key] = (short[key] ?? 0) + rem;
      return;
    }
    gold += rem * R.costGold;
    const sacLevel = R.sacrificeLevel ?? level - 0.5;
    need(level - 0.5, rem);
    need(sacLevel, rem * R.sacrifices);
  }
  const topR = CRAFT_RULES[levelKey(topLevel)];
  const sacLevel = topR.sacrificeLevel ?? topLevel;
  gold += topR.costGold;
  need(sacLevel, topR.sacrifices);
  return { shortfall: short, gold };
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Строка инвентаря, из которой собирается пул планировщика. */
export type PoolRow = {
  id: string;
  level: number | string;
  template_id: string;
  serial_no: number | null;
  rest_until: string | null;
  obtained_at?: string | null;
};

/**
 * Пул: другие фишки коллекции без отдыхающих — в ОДНОМ порядке для превью,
 * улучшения и пакетной проверки. При требовании «одного вида» планировщик
 * берёт первую подходящую фишку, и от порядка зависит, хватит ли одинаковых;
 * раньше порядок был тем, в каком их вернула база (не задан вовсе).
 */
export function toPlanPool(rows: PoolRow[], exceptId: string | null, now: number): PlanChip[] {
  return [...rows]
    .sort((a, b) => cmp(a.obtained_at ?? "", b.obtained_at ?? "") || cmp(a.id, b.id))
    .filter((r) => r.id !== exceptId && !(r.rest_until && new Date(r.rest_until).getTime() > now))
    .map((r) => ({
      id: r.id,
      level: Number(r.level),
      template: r.template_id,
      serial: r.serial_no,
    }));
}

/**
 * План улучшения фишки на один шаг (level → level + 0.5) из пула ДРУГИХ её
 * фишек той же коллекции (уже без отдыхающих). Проверки «чья, на продаже,
 * отдыхает, максимум, есть ли правило» — на вызывающем.
 */
export function planUpgrade(
  base: { id: string; level: number; template: string },
  pool: PlanChip[],
  haveGold: number,
  mult: number,
) {
  const topR = CRAFT_RULES[levelKey(base.level)];
  const have: Record<string, number> = {};
  for (const c of pool) have[levelKey(c.level)] = (have[levelKey(c.level)] ?? 0) + 1;
  const cs = countShortfall(have, base.level);
  const shortfall = Object.entries(cs.shortfall)
    .filter(([, n]) => n > 0)
    .map(([lvl, n]) => ({ level: Number(lvl), count: n }))
    .sort((a, b) => a.level - b.level);

  const ctx: PlanCtx = { n: 0, mult };
  const topSacLevel = topR.sacrificeLevel ?? base.level;
  const topSacTmpl = topR.requireIdentical ? base.template : null;
  let curPool = pool;
  const steps: PlanStep[] = [];
  let gold = 0;
  const sacIds: string[] = [];
  let feasibleChips = true;
  for (let i = 0; i < topR.sacrifices; i++) {
    const s = acquireChip(curPool, topSacLevel, topSacTmpl, ctx);
    if (!s) {
      if (topSacTmpl && !ctx.miss) ctx.miss = { level: topSacLevel, identical: true };
      feasibleChips = false;
      break;
    }
    curPool = s.pool;
    steps.push(...s.steps);
    gold += s.gold;
    sacIds.push(s.chip.id);
  }
  if (feasibleChips) {
    const topGold = goldAtMultiplier(topR.costGold, mult);
    steps.push({
      out: "final",
      base: base.id,
      sacs: sacIds,
      gold: topGold,
      src_level: base.level,
      sac_level: topSacLevel,
      identical: topR.requireIdentical,
    });
    gold += topGold;
  }

  const consumedIds = new Set<string>();
  for (const st of steps) {
    if (st.base.startsWith("uci_") && st.base !== base.id) consumedIds.add(st.base);
    for (const s of st.sacs) if (s.startsWith("uci_")) consumedIds.add(s);
  }
  const burnChips = pool
    .filter((c) => consumedIds.has(c.id))
    .map((c) => ({ id: c.id, level: c.level, serial: c.serial }))
    .sort((a, b) => a.level - b.level || (a.serial ?? 0) - (b.serial ?? 0));

  const enoughGold = haveGold + 1e-6 >= gold;
  // Причина для случая, когда фишек «по количеству» хватает, а собрать нельзя
  // из-за требования одного шаблона: countShortfall шаблон не видит и молчит.
  const missReason: MissReason | null = feasibleChips
    ? null
    : ctx.miss?.identical
      ? { kind: "same_type", level: ctx.miss.level }
      : { kind: "chips" };
  return {
    feasible: feasibleChips && enoughGold,
    missReason,
    feasibleChips,
    targetLevel: base.level + 0.5,
    baseLevel: base.level,
    steps,
    burnChips,
    totalGold: gold,
    haveGold: Math.floor(haveGold),
    goldShortfall: enoughGold ? 0 : Math.ceil(gold - haveGold - 1e-6),
    shortfall,
  };
}
