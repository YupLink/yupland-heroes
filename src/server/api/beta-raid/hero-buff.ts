// Временные БАФФЫ героя: зеркало ослаблений от боссов.
//
// Лежат там же, где дебафы (beta_raid_player_effects, виды buff_atk/buff_arm/
// buff_int/buff_spd/buff_hp/buff_luck, небоевые buff_trade/buff_alchemy),
// живут на АККАУНТЕ и отпускают сами. Торговля и Алхимия в бой не идут —
// их читает только ёмкость рюкзака и сумки зелий (market-backpack).
// Отсюда — чтение, запись и пересчёт статов, чтобы бой, карта и окно героя
// показывали одно и то же число.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { heroCombat, heroField } from "@/lib/hero/heroPowerCurve";
import { HERO_STAT_KEYS, type HeroStats } from "@/lib/heroStats";
import {
  BOOST_NUM_KEYS,
  type BoostNumStat,
  type BoostRoll,
  type HeroBoosts,
} from "@/lib/hero/boost";
import { immuneEffectKind } from "@/lib/hero/boostImmune";
import type { HeroPowerInfo } from "./hero-power";

/** Виды баффов — по одному на характеристику (включая Торговлю и Алхимию). */
export const BUFF_KINDS = BOOST_NUM_KEYS.map((s) => `buff_${s}`);

/** Какую характеристику поднимает вид. */
export const buffStat = (kind: string): BoostNumStat | null => {
  const s = kind.startsWith("buff_") ? kind.slice(5) : "";
  return (BOOST_NUM_KEYS as readonly string[]).includes(s) ? (s as BoostNumStat) : null;
};

export const buffKind = (stat: BoostNumStat): string => `buff_${stat}`;

/** Активные баффы аккаунта: характеристика → сколько пунктов. */
export async function loadBuffValues(
  account: string,
  /** Без баффов этого источника (алтарь не мешает храму замка — и наоборот). */
  excludeSource?: string,
): Promise<HeroBoosts> {
  if (!account) return {};
  const rows = (await mcpExec(
    `SELECT kind, value FROM yuplink.beta_raid_player_effects
      WHERE kind IN (${BUFF_KINDS.map(sqlStr).join(",")}) AND expires_at > now()
        AND account_id = ${sqlStr(account)}${excludeSource ? ` AND source IS DISTINCT FROM ${sqlStr(excludeSource)}` : ""};`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ kind: string; value: number }>;
  const out: HeroBoosts = {};
  for (const row of rows ?? []) {
    const stat = buffStat(String(row.kind));
    const v = Math.max(0, Math.floor(Number(row.value) || 0));
    if (stat && v > 0) out[stat] = (out[stat] ?? 0) + v;
  }
  return out;
}

/** Баффы по кошельку. Ошибку глушим — герой важнее эффекта. */
export async function loadBuffsFor(wallet: string, excludeSource?: string): Promise<HeroBoosts> {
  try {
    const { raidOwner } = await import("./owner");
    return await loadBuffValues(await raidOwner(wallet), excludeSource);
  } catch {
    return {};
  }
}

/** Есть ли бафф БОЕВОГО стата: Торговля/Алхимия героя в бою не пересчитывают. */
export const hasBuff = (b: HeroBoosts): boolean => HERO_STAT_KEYS.some((k) => (b[k] ?? 0) > 0);

/** Характеристики с учётом баффов. */
export function buffStats(stats: HeroStats, b: HeroBoosts): HeroStats {
  const out: HeroStats = { ...stats };
  for (const stat of HERO_STAT_KEYS) {
    const add = Number(b[stat]) || 0;
    if (add > 0) out[stat] = (Number(out[stat]) || 0) + add;
  }
  return out;
}

/**
 * Герой с учётом баффов: те же поля, но статы и кривые пересчитаны, а сами
 * прибавки видны отдельным полем — карточка героя показывает их колонкой.
 */
export function buffHero(info: HeroPowerInfo, b: HeroBoosts): HeroPowerInfo {
  if (!hasBuff(b)) return info;
  const stats = buffStats(info.stats, b);
  // В колонку «Эффекты» бусты идут плюсом; минус туда добавит weakenHero.
  const effects = buffStats(info.effects, b);
  return {
    ...info,
    effects,
    stats,
    combat: heroCombat(stats, info.combat.softImmune),
    field: heroField(stats),
  };
}

/**
 * Повесить бафф на игрока. Правило продления — общее с дебафами: значение
 * усредняется по оставшемуся времени, срок складывается (applyPlayerEffect).
 */
export async function applyBuff(
  wallet: string,
  stat: BoostNumStat,
  value: number,
  minutes: number,
): Promise<void> {
  const { applyTimedEffect } = await import("./encounter-effects");
  await applyTimedEffect(wallet, buffKind(stat), Math.round(value), Math.round(minutes));
}

/**
 * Повесить один выпавший эффект — бафф стата, иммунитет или забвение.
 * Иммунитет — не buff_*: одна строка на вид (immune_poison), повтор ПРОДЛЕВАЕТ
 * срок по тому же правилу, что и у дебаффов, а сила всегда 1. Забвение —
 * уровень или время на аккаунте (oblivion.ts): зелье, заклинание и алтарь
 * выдают его тем же путём.
 */
export async function applyBoostRoll(wallet: string, r: BoostRoll): Promise<void> {
  if (r.stat === "oblivion") {
    const { grantOblivionTo } = await import("./oblivion");
    return grantOblivionTo(wallet, r);
  }
  // Еда: прибавка к шкале сытости героя (не выше потолка), не бафф со сроком.
  if (r.stat === "satiety") {
    const { moveSatiety } = await import("./hero-satiety");
    await moveSatiety(wallet, Math.max(0, Math.round(r.amount)));
    return;
  }
  if (r.stat !== "immune") return applyBuff(wallet, r.stat, r.amount, r.minutes);
  if (!r.ability) return;
  const { applyTimedEffect } = await import("./encounter-effects");
  await applyTimedEffect(wallet, immuneEffectKind(r.ability), 1, Math.round(r.minutes));
}
