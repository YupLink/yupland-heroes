// Ослабление героя прямо в бою (задачник 23.09, «отложенное срабатывание
// дебафа»): босс наложил −N — следующие удары героя уже слабее, а не со
// следующего боя.
//
// Сила — по тому же правилу, что запишет база после боя (encounter-effects,
// applyPlayerEffect): один эффект на вид, повтор продлевает, сила — среднее по
// времени с тем, что уже висит. Иначе в бою герой был бы слабее, чем после.
//
// Всё читается ДО боя и до списания энергии: сама симуляция в базу не ходит.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { WEAKEN_KINDS, isWeakenKind, type AbilityCfg, type WeakenKind } from "./abilities";
import { loadHeroView, type HeroPowerView } from "./hero-power";
import { weakenHero, type WeakenMap } from "./hero-weaken";
import { immuneHero } from "./hero-immune";
import { raidOwner } from "./owner";
import type { Reweaken, SimSideEffects } from "./encounter-sim-types";
import type { HeroCombat } from "@/lib/hero/heroPowerCurve";

/** Висящее ослабление: сила и сколько секунд ему осталось. */
export type TimedWeaken = { value: number; sec: number };
type TimedMap = Partial<Record<WeakenKind, TimedWeaken>>;

/** Сила вида после наложения — как её посчитает база: среднее по времени. */
export function mergeNow(was: TimedWeaken | undefined, now: { value: number; minutes: number }) {
  if (!was || was.sec <= 0 || was.value <= 0) return now.value;
  if (was.value === now.value) return now.value;
  const t = now.minutes * 60;
  return Math.max(1, Math.round((was.value * was.sec + now.value * t) / (was.sec + t)));
}

/** Ослабления на остаток боя: висевшие до боя плюс наложенные в нём. */
export function fightWeakenMap(was: TimedMap, fight: SimSideEffects["weaken"]): WeakenMap {
  const out: WeakenMap = {};
  for (const kind of WEAKEN_KINDS) {
    const now = fight[kind];
    const value = now && now.value > 0 ? mergeNow(was[kind], now) : (was[kind]?.value ?? 0);
    if (value > 0) out[kind] = value;
  }
  return out;
}

/**
 * Пересчёт героя по ослаблениям боя. Повтор той же силы (продлили минуты, а
 * сила не сдвинулась) отдаёт прежнего героя: длинный бой не пересобирает его
 * каждый раунд.
 */
export function makeReweaken(
  base: NonNullable<HeroPowerView["fightBase"]>,
  was: TimedMap,
): Reweaken {
  let key = "";
  let last: HeroCombat | null = null;
  return (fight) => {
    const map = fightWeakenMap(was, fight);
    const next = JSON.stringify(map);
    if (last && next === key) return last;
    key = next;
    last = immuneHero(weakenHero(base.buffed, map), base.immune).combat;
    return last;
  };
}

async function loadTimedWeaken(wallet: string): Promise<TimedMap> {
  const account = await raidOwner(wallet);
  if (!account) return {};
  const rows = (await mcpExec(
    `SELECT kind, value,
            GREATEST(EXTRACT(EPOCH FROM (expires_at - now())), 0)::float8 AS sec
       FROM yuplink.beta_raid_player_effects
      WHERE account_id = ${sqlStr(account)} AND expires_at > now()
        AND kind IN (${WEAKEN_KINDS.map(sqlStr).join(",")});`,
    { wrapJson: true },
  )) as Array<{ kind: string; value: number | string; sec: number | string }>;
  const out: TimedMap = {};
  for (const r of rows ?? []) {
    const value = Math.max(0, Math.floor(Number(r.value) || 0));
    if (value > 0) out[r.kind as WeakenKind] = { value, sec: Math.max(0, Number(r.sec) || 0) };
  }
  return out;
}

/**
 * Пересчёт героя для симуляции — только если цель умеет ослаблять и у героя
 * есть что ослаблять (бонусы в этом бою включены). Иначе undefined: бой идёт
 * прежней веткой. Сбой чтения — тоже undefined: удар важнее эффекта.
 */
export async function loadFightWeaken(
  wallet: string,
  abilities: AbilityCfg[] | null | undefined,
): Promise<Reweaken | undefined> {
  if (!abilities?.some((a) => isWeakenKind(a.kind))) return undefined;
  try {
    const view = await loadHeroView(wallet);
    const base = view?.fightBase;
    if (!base) return undefined;
    return makeReweaken(base, await loadTimedWeaken(wallet));
  } catch (e) {
    console.warn("[fight-weaken] ослабление в бою не подготовлено:", e);
    return undefined;
  }
}
