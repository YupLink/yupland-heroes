// «Снятие иммунитетов» на аккаунте (владелец, 22.10.2026): строка
// beta_raid_player_effects вида strip_immune со сроком. Пока висит — у героя в
// бою не действует НИ ОДИН иммунитет: ни от надетых артефактов, ни временный
// (immune_* от зелий/еды/заклинаний). Истекла — всё возвращается само: строку
// читаем на каждый бой по expires_at > now(), кэша между боями нет.
//
// Иммунитеты снимаются в одной точке — сборе стороны героя (loadHeroSide), то
// есть в обоих боях бета-рейда: с целью карты и с охраной шахты/сундука. Сила
// героя на карте и в замке не трогается: снятие — про способности врага.
//
// Повтор продлевает, как у остальных дебаффов: applyPlayerEffect складывает
// остаток с новыми минутами (одна строка на аккаунт).
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { STRIP_IMMUNE_KIND } from "./abilities";
import { applyPlayerEffect } from "./encounter-effects";
import type { HeroPowerInfo } from "./hero-power";

/** Висит ли сейчас на аккаунте снятие иммунитетов. */
export async function stripActive(account: string): Promise<boolean> {
  if (!account) return false;
  const rows = (await mcpExec(
    `SELECT 1 AS x FROM yuplink.beta_raid_player_effects
      WHERE account_id = ${sqlStr(account)} AND kind = ${sqlStr(STRIP_IMMUNE_KIND)}
        AND expires_at > now()
      LIMIT 1;`,
    { wrapJson: true },
  )) as unknown[] | null;
  return (rows ?? []).length > 0;
}

/** Герой без иммунитетов: статы и множители те же, пуст только набор иммунитетов. */
export function stripHero(info: HeroPowerInfo): HeroPowerInfo {
  if (info.combat.softImmune.size === 0) return info;
  return { ...info, combat: { ...info.combat, softImmune: new Set() } };
}

/**
 * Герой для боя с учётом снятия. Иммунитетов нет — в базу не ходим: снимать
 * нечего, и бой без героя-с-иммунитетами не платит лишний запрос. Сбой чтения
 * оставляет героя как есть — удар важнее эффекта.
 */
export async function withStrip(
  wallet: string,
  hero: HeroPowerInfo | null,
): Promise<HeroPowerInfo | null> {
  if (!hero || hero.combat.softImmune.size === 0) return hero;
  try {
    const { raidOwner } = await import("./owner");
    return (await stripActive(await raidOwner(wallet))) ? stripHero(hero) : hero;
  } catch (e) {
    console.warn("[hero-strip] снятие иммунитетов не прочитано:", e);
    return hero;
  }
}

/** Повесить снятие на minutes минут; `source` — кто снял (имя цели). */
export async function applyStrip(
  wallet: string,
  minutes: number,
  source?: string | null,
): Promise<void> {
  // Сила у снятия одна — «все иммунитеты»; value = 1 только чтобы строка жила.
  return applyPlayerEffect(wallet, STRIP_IMMUNE_KIND, 1, minutes, source);
}
