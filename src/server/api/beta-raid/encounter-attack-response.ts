// Ответ клиенту на удар энкаунтера (encounter-attack): итог боя, награда,
// побочки и что дал герой. Поля — ровно те, что ждёт окно боя (AttackResult
// в useBetaEncounter).
import type { EncounterTarget } from "@/server/api/beta-raid/encounter-target";
import type { ObjectHpRow } from "@/server/api/beta-raid/encounter-hp";
import type { SimChip, SimResult } from "@/server/api/beta-raid/encounter-sim";
import type { HeroCombat } from "@/server/api/beta-raid/encounter-hero-apply";
import type { HeroSquadLineup } from "@/server/api/beta-raid/encounter-lineup-squad";
import type { GrantedReward } from "@/server/api/beta-raid/encounter-rewards";
import type { RunnerReveal } from "@/server/api/beta-raid/runner-reveal";
import type { ArtBreakNote } from "@/lib/hero/artBroken";
import { abilityTotals } from "@/server/api/beta-raid/encounter-ability-totals";
import { trimFightLog } from "@/server/api/beta-raid/encounter-log-trim";

export function buildAttackResponse(o: {
  target: EncounterTarget;
  hpRow: ObjectHpRow;
  commit: { dealt: number; hpAfter: number; killed: boolean };
  sim: SimResult;
  side: { burned: number; artBroken: ArtBreakNote[] };
  rewards: GrantedReward[];
  reveal: RunnerReveal | null;
  heroSquad: HeroSquadLineup | null;
  combat: HeroCombat | null;
  /** Фишки не были выбраны — сервер взял самые сильные (encounter-lineup); нет — null. */
  autoLineup?: SimChip[] | null;
}) {
  const { target, hpRow, commit, sim, side, rewards, reveal, heroSquad, combat } = o;
  const { burned } = side;
  return {
    kind: target.kind,
    badgeLabel: target.badgeLabel,
    name: target.name,
    imageUrl: target.imageUrl,
    backgroundUrl: target.backgroundUrl,
    dealt: commit.dealt,
    killed: commit.killed,
    hpAfter: commit.hpAfter,
    maxHp: Number(hpRow.max_hp),
    rounds: sim.rounds,
    wiped: sim.wiped,
    spentEnergy: target.interactionCost + burned,
    burnedEnergy: burned,
    slowed: sim.side.slow,
    // Что босс навесил на фишки — чтобы игрок понимал, почему часть отряда
    // выпала из следующего боя.
    chipEffects: sim.side.chipEffects.map((e) => ({
      kind: e.kind,
      minutes: e.minutes,
      chip: e.chip ?? null,
    })),
    // Удар изменил фишки игрока (видно в инвентаре: оглушение) — только тогда
    // клиент перечитывает инвентарь фишек (attackRefresh, владелец 23.10.2026).
    chipsChanged: sim.side.chipEffects.some((e) => e.kind === "stun"),
    // Значки итога считает сервер: лог ниже обрезан, а сколько энергии
    // сожжено на самом деле, знает только он.
    abilityTotals: abilityTotals(sim.abilities, burned, sim.side),
    abilityLog: trimFightLog(sim.abilities), // бой на тысячи раундов иначе — мегабайты
    log: trimFightLog(sim.log),
    rewards,
    /** Кто открылся под добитым объектом (runner-reveal) — или ничего. */
    reveal,
    // as const: в самом ударе тип был литералом false — вынос в функцию его
    // расширил бы до boolean, и тип ответа server fn поменялся бы.
    pickup: false as const,
    // Состав, собранный сервером (фишки не были выбраны): окно боя запоминает его у
    // игрока — в «фишках» сразу видно, кем бились.
    autoLineup: o.autoLineup?.length
      ? o.autoLineup.map((c) => ({ templateId: c.templateId, level: c.level }))
      : undefined,
    artBroken: side.artBroken, // слетело с героя сломанным (§8.63 п.3) — плашка над героем
    // Отряд героя: сколько записей не вышло в бой и почему — окно боя
    // объясняет «9 из 10», не пересобирая состав.
    heroSquad: heroSquad
      ? { total: heroSquad.total, busy: heroSquad.busy, gone: heroSquad.gone }
      : undefined,
    // Множители перечисляем поимённо: в combat лежит ещё и Set иммунитетов,
    // который в JSON превратился бы в пустой объект.
    heroBonus: combat
      ? {
          atkMult: combat.atkMult,
          hpMult: combat.hpMult,
          missPct: combat.missPct,
          luckPct: combat.luckPct,
          luckMin: combat.luckMin,
          luckMax: combat.luckMax,
        }
      : undefined,
  };
}
