// Сам бой удара энкаунтера (encounter-attack): сборка отряда и героя, плата
// энергией, симуляция и запись урона. Порядок здесь — правило, а не вкус:
// отряд до платы, плата последней перед боем, урон первым после боя.
import { getHallwayConfig } from "@/server/api/hallwayConfig";
import type { EncounterTarget } from "@/server/api/beta-raid/encounter-target";
import { applyObjectDamage, type ObjectHpRow } from "@/server/api/beta-raid/encounter-hp";
import { simulateEncounter, type SimChip } from "@/server/api/beta-raid/encounter-sim";
import { instantLoot, opensWithoutFight } from "@/server/api/beta-raid/encounter-loot";
import { computeChipMults } from "@/server/api/beta-raid/encounter-mults";
import { resolveLineupInfo, type LineupInfo } from "@/server/api/beta-raid/encounter-lineup";
import { heroBossBonusEnabled } from "@/server/api/beta-raid/hero-power";
import { loadHeroSide } from "@/server/api/beta-raid/encounter-hero-squad";
import { immunityOnly } from "@/server/api/beta-raid/encounter-hero-apply";
import { loadFightWeaken } from "@/server/api/beta-raid/fight-weaken";
import type { AttackInput } from "@/server/api/beta-raid/encounter-attack-input";

export async function fightAndCommit(opts: {
  wallet: string;
  target: EncounterTarget;
  hpRow: ObjectHpRow;
  /** Состав из окна боя — как прислал клиент (encounter-attack-input). */
  passedLineup: AttackInput["lineup"];
}) {
  const { wallet, target, hpRow, passedLineup } = opts;
  // Герой выходит СВОИМ отрядом: состав закреплён в замке, выбора фишек в
  // окне боя больше нет. Флаг выключен — героя нет, идёт прежняя ветка.
  const { hero, squad: heroSquad } = await loadHeroSide(wallet);
  // Отряд собираем ДО списания энергии — иначе при отказе энергия сгорала.
  // Фишки не выбраны — сервер берёт самые сильные (auto): окно боя запомнит этот состав.
  const picked: LineupInfo = heroSquad
    ? { lineup: heroSquad.lineup, auto: false }
    : await resolveLineupInfo(wallet, (passedLineup ?? []) as SimChip[]);
  const lineup = picked.lineup;
  // Оглушённых resolveLineup уже не вернул — здесь только читаем яд,
  // который висит на уцелевших фишках.
  const { loadChipEffects, poisonByChip } = await import("@/server/api/beta-raid/chip-effects");
  const effects = await loadChipEffects(
    lineup.map((c) => c.chipId).filter((x): x is string => !!x),
  );
  if (lineup.length === 0) {
    throw new Error("Нет фишек для боя — открой пак или дождись отдыха фишек");
  }

  const cfg = await getHallwayConfig();
  // Бонусы за тираж коллекции и премиум — как в обычном рейде.
  const mults = await computeChipMults(lineup);
  // По БОССАМ бонусы героя — под отдельным флагом: фонд босса делится по
  // вкладу урона, и усиленный тестер отбирал бы DARAI у остальных.
  const combat =
    hero && (target.kind !== "boss" || (await heroBossBonusEnabled(wallet))) ? hero.combat : null;
  // Ослабление, наложенное в этом бою, действует сразу (fight-weaken).
  const reweaken = combat ? await loadFightWeaken(wallet, target.abilities) : undefined;

  // Энергию списываем ПОСЛЕДНИМ действием перед боем: всё, что читается из
  // базы, уже прочитано, и обрыв связи на этих шагах больше не съедает её
  // впустую. Возврат — на случай, если урон так и не запишется.
  const { payForHit } = await import("@/server/api/beta-raid/encounter-pay");
  const payment = await payForHit(wallet, target.interactionCost);

  // Сундук и монетка боем не берутся: заплатил за подход — забрал (см.
  // encounter-loot). Симуляцию для них не гоняем вовсе.
  const sim = opensWithoutFight(target.kind)
    ? instantLoot(Number(hpRow.current_hp))
    : simulateEncounter({
        lineup,
        targetHp: Number(hpRow.current_hp),
        trialStatScale: cfg.boss?.trialStatScale ?? 1,
        mults,
        abilities: target.abilities,
        damage: target.damage ?? undefined,
        poison: poisonByChip(effects),
        // Бонусы по боссам выключены — иммунитет артефактов всё равно едет.
        hero: combat ?? (hero ? immunityOnly(hero.combat) : undefined),
        reweaken,
      });

  // Урон записываем ПЕРВЫМ делом после боя: раньше перед ним успевали
  // отработать яд, оглушение и замедление — три обращения к базе, и обрыв
  // на любом означал «энергию сняло, удар не засчитан».
  let commit: Awaited<ReturnType<typeof applyObjectDamage>>;
  try {
    commit = await applyObjectDamage({ hpId: hpRow.id, damage: sim.dealt, wallet });
  } catch (e) {
    await payment.refund();
    console.error("[beta-attack] урон не записался, энергия возвращена:", e);
    throw new Error("Удар не засчитан — связь с базой оборвалась. Энергия возвращена, повтори");
  }
  return { hero, heroSquad, combat, sim, commit, autoLineup: picked.auto ? lineup : null };
}
