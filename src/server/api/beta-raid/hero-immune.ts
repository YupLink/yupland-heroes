// Временный ИММУНИТЕТ героя от зелья/заклинания/алтаря.
//
// Строки beta_raid_player_effects вида immune_<вид способности> (или immune_all),
// на аккаунте, со сроком. Пока висят — виды добавляются в softImmune героя, и
// дальше работает тот же путь, что у иммунитета от надетой вещи: resistedChance
// обнуляет шанс наложения во всех боях бета-рейда, включая immunityOnly (бонусы
// героя по боссам выключены, а иммунитет всё равно едет).
//
// Висящий дебафф отсюда не снимается: иммунитет закрывает только НОВЫЕ
// наложения (правило владельца 21.09).
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { heroCombat } from "@/lib/hero/heroPowerCurve";
import {
  IMMUNE_PREFIX,
  expandImmune,
  immuneTargetOf,
  type ImmuneTarget,
} from "@/lib/hero/boostImmune";
import type { AbilityKind } from "./abilities";
import type { HeroPowerInfo } from "./hero-power";

/** Активные цели иммунитета аккаунта как записаны: poison, all, … */
export async function loadImmuneTargets(account: string): Promise<Set<ImmuneTarget>> {
  const out = new Set<ImmuneTarget>();
  if (!account) return out;
  const rows = (await mcpExec(
    `SELECT kind FROM yuplink.beta_raid_player_effects
      WHERE left(kind, ${IMMUNE_PREFIX.length}) = ${sqlStr(IMMUNE_PREFIX)}
        AND expires_at > now() AND account_id = ${sqlStr(account)};`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ kind: string }>;
  for (const r of rows ?? []) {
    const t = immuneTargetOf(String(r.kind));
    if (t) out.add(t);
  }
  return out;
}

/** То же по кошельку. Ошибку глушим — герой важнее эффекта. */
export async function loadImmuneTargetsFor(wallet: string): Promise<Set<ImmuneTarget>> {
  try {
    const { raidOwner } = await import("./owner");
    return await loadImmuneTargets(await raidOwner(wallet));
  } catch {
    return new Set();
  }
}

/** Какие виды способностей сейчас закрыты временным иммунитетом («все» раскрыт). */
export async function loadImmuneKinds(account: string): Promise<Set<AbilityKind>> {
  return expandImmune(await loadImmuneTargets(account));
}

/** То же по кошельку — для силы героя (hero-power). */
export async function loadImmuneFor(wallet: string): Promise<Set<AbilityKind>> {
  return expandImmune(await loadImmuneTargetsFor(wallet));
}

/**
 * Герой с временными иммунитетами поверх иммунитетов от вещей. Статы не
 * меняются — пересобираем только боевую часть, чтобы softImmune ехал вместе
 * с ней во все бои.
 */
export function immuneHero(info: HeroPowerInfo, kinds: Set<AbilityKind>): HeroPowerInfo {
  if (kinds.size === 0) return info;
  const all = new Set<AbilityKind>([...info.combat.softImmune, ...kinds]);
  return { ...info, combat: heroCombat(info.stats, all) };
}
