// Бонус к рыбалке героя (владелец, 14.10.2026; lib/raid/fishBonus.ts):
// надетые артефакты с «Бонусом к рыбалке» + удача (каждые 50 → +10 % к базе).
//
// Удача — та, с которой герой идёт в бой: та же сборка, что у loadHeroView
// (buildHeroPower с голодом → buffHero → weakenHero), только мимо её кэша —
// выпил зелье и сразу забросил, бонус уже с ним. Сила героя закрыта флагом —
// удачи как бы нет, но бонус артефактов всё равно считается: он на предмете.
//
// «Зелье удачи действует только пока действует» (владелец, 14.10.2026, вечер):
// каждый бафф удачи (buff_luck — зелье, заклинание, храм) живёт до своего срока.
// План бонуса — бонус сейчас и ступень на каждый срок: с этого мига удача уже
// без истёкшего баффа. Заброс пишет ступени в строку (chance_steps), и попытка
// после срока идёт без его удачи. Ослабление удачи от босса держится весь
// заброс, как и было.
import { fisherBaseAdd, heroFishBonus } from "@/lib/raid/fishBonus";
import type { BonusStep } from "@/lib/raid/fishChanceSteps";
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { buffHero } from "@/server/api/beta-raid/hero-buff";
import { loadWeakenFor, weakenHero, type WeakenMap } from "@/server/api/beta-raid/hero-weaken";
import { loadSelectedHero, type LoadedHero } from "@/server/api/beta-raid/hero-load";
import type { HeroPowerInfo } from "@/server/api/beta-raid/hero-power";

/** Бафф удачи: сколько пунктов и до какого мига (мс по часам базы). */
export type LuckBuff = { value: number; endMs: number };

/** Бонус сейчас (% к базе) и его ступени по срокам баффов удачи. */
export type FishBonusPlan = { bonusPct: number; steps: BonusStep[] };

/** Бонус героя сейчас и прибавка к базе мира в пунктах (рыбак, fisherBaseAdd). */
export type FishBonusNow = { bonusPct: number; addPct: number };

/** Живые баффы удачи аккаунта со сроками (wrapJson). */
export const luckBuffsSql = (account: string): string =>
  `SELECT value, (extract(epoch FROM expires_at) * 1000)::float8 AS "endMs"
     FROM yuplink.beta_raid_player_effects
    WHERE account_id = ${sqlStr(account)} AND kind = 'buff_luck' AND expires_at > now()`;

/** Строки чтения → баффы: пункты целые и выше нуля, как у loadBuffValues. */
export function parseLuckBuffs(
  rows: ReadonlyArray<{ value: unknown; endMs: unknown }>,
): LuckBuff[] {
  return rows
    .map((r) => ({ value: Math.max(0, Math.floor(Number(r.value) || 0)), endMs: Number(r.endMs) }))
    .filter((b) => b.value > 0 && Number.isFinite(b.endMs));
}

/**
 * Удача героя в миг t: баффы, чей срок к t не вышел, поверх героя, потом
 * ослабление — порядок loadHeroView (сначала свои баффы, потом босс снимает).
 */
export function luckAt(
  info: HeroPowerInfo,
  buffs: readonly LuckBuff[],
  weaken: WeakenMap,
  t: number,
): number {
  const luck = buffs.reduce((s, b) => (b.endMs > t ? s + b.value : s), 0);
  return weakenHero(buffHero(info, { luck }), weaken).stats.luck;
}

/** План бонуса: сейчас (живы все баффы) и ступень на каждый срок баффа. */
export function bonusPlanOf(
  gear: LoadedHero["gear"],
  luckOf: (t: number) => number,
  ends: readonly number[],
): FishBonusPlan {
  const bonus = (t: number) => heroFishBonus({ gear, luck: luckOf(t) });
  const at = [...new Set(ends)].filter(Number.isFinite).sort((a, b) => a - b);
  return {
    bonusPct: bonus(Number.NEGATIVE_INFINITY),
    steps: at.map((t) => ({ at: t, bonusPct: bonus(t) })),
  };
}

/** Живые баффы удачи кошелька. Сбой базы — бросок: заброс не начнётся с чужим шансом. */
async function luckBuffsOf(wallet: string): Promise<LuckBuff[]> {
  const { raidOwner } = await import("@/server/api/beta-raid/owner");
  const account = await raidOwner(wallet);
  if (!account) return [];
  const rows = (await mcpExec(luckBuffsSql(account), { wrapJson: true })) as Array<{
    value: unknown;
    endMs: unknown;
  }>;
  return parseLuckBuffs(rows ?? []);
}

/**
 * План бонуса героя кошелька и прибавка рыбака к базе. Героя нет — нули.
 * Способность — на шаблоне героя, как бонус артефакта на предмете: считается
 * и при закрытой силе героя.
 */
export async function fishBonusPlan(wallet: string): Promise<FishBonusPlan & FishBonusNow> {
  const hero = await loadSelectedHero(wallet).catch(() => null);
  if (!hero) return { bonusPct: 0, steps: [], addPct: 0 };
  const addPct = fisherBaseAdd(hero.ability);
  const hp = await import("@/server/api/beta-raid/hero-power");
  if (!(await hp.heroPowerEnabled(wallet))) {
    return { ...bonusPlanOf(hero.gear, () => 0, []), addPct };
  }
  const [buffs, weaken] = await Promise.all([luckBuffsOf(wallet), loadWeakenFor(wallet)]);
  const { info } = hp.buildHeroPower(hero);
  const plan = bonusPlanOf(
    hero.gear,
    (t) => luckAt(info, buffs, weaken, t),
    buffs.map((b) => b.endMs),
  );
  return { ...plan, addPct };
}

/** Бонус героя кошелька сейчас (% к базе) и прибавка рыбака к базе. Сбой — нули. */
export async function fishBonusOf(wallet: string): Promise<FishBonusNow> {
  const p = await fishBonusPlan(wallet).catch(() => null);
  return { bonusPct: p?.bonusPct ?? 0, addPct: p?.addPct ?? 0 };
}
