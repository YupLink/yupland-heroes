// Что происходит ПОСЛЕ засчитанного удара энкаунтера (encounter-attack):
// побочки боя (энергия, дебафы, износ артефактов и их поломка), весть о
// добитом объекте, журнал удара и награда. Плюс сытость за подбор монетки.
import type { EncounterTarget } from "@/server/api/beta-raid/encounter-target";
import type { CellObject } from "@/server/api/beta-raid/cell-override";
import { logObjectRun, type ObjectHpRow } from "@/server/api/beta-raid/encounter-hp";
import { grantEncounterRewards } from "@/server/api/beta-raid/encounter-rewards";
import { claimObjectPayout, payoutByTop } from "@/server/api/beta-raid/encounter-payout";
import { publishRaid } from "@/server/raidLive";
import { noteCellsChanged } from "@/server/api/beta-raid/map-change-hooks";
import type { SimResult } from "@/server/api/beta-raid/encounter-sim";
import { applySideEffects } from "@/server/api/beta-raid/encounter-side-apply";
import { RUNNER_LAYER } from "@/server/api/beta-raid/runners";
import { revealRunnerAt, type RunnerReveal } from "@/server/api/beta-raid/runner-reveal";
import { raidOwner } from "@/server/api/beta-raid/owner";

/** Подобрать золото — как шаг: −1 сытости (lib/hero/satiety), на острове ×0,1. */
export async function chargePickupSatiety(wallet: string, mapId: string): Promise<void> {
  const { moveSatiety } = await import("@/server/api/beta-raid/hero-satiety");
  const { SATIETY_COST } = await import("@/lib/hero/satiety");
  const { satietyMultOf, scaleSatiety } = await import("@/lib/raid/island/satiety");
  const cost = scaleSatiety(SATIETY_COST.pickup, satietyMultOf(mapId));
  await moveSatiety(wallet, -cost).catch(() => null);
}

export async function afterHit(opts: {
  wallet: string;
  mapId: string;
  q: number;
  r: number;
  cell: CellObject;
  target: EncounterTarget;
  hpRow: ObjectHpRow;
  sim: SimResult;
  commit: { dealt: number; hpAfter: number; killed: boolean };
  /** Герой, который дрался в этом ударе: его надетые артефакты изнашиваются. */
  hero: { heroId: string } | null;
}) {
  const { wallet, mapId, q, r, cell, target, hpRow, sim, commit, hero } = opts;
  // Побочки боя (энергия, замедление, ослабление, эффекты фишек, износ) — общим модулем.
  // Бой для износа — одна жизнь цели: строка HP, поколение, начало жизни.
  const fight = `obj:${hpRow.id}:${hpRow.generation}:${hpRow.life_started_at ?? ""}`;
  const side = await applySideEffects(
    wallet,
    sim.side,
    "[beta-attack]",
    target.name,
    hero ? { heroId: hero.heroId, fight } : null,
  );
  const accountId = await raidOwner(wallet);
  const generation = Number(hpRow.generation ?? 0) || 0;
  // Добили верхний объект — под ним мог прятаться беглец. Показываем его
  // сразу: он остаётся жив и бьётся отдельно, вторым заходом.
  let reveal: RunnerReveal | null = null;
  if (commit.killed) {
    const wasRunner = cell.layer === RUNNER_LAYER;
    reveal = wasRunner ? null : await revealRunnerAt(mapId, q, r).catch(() => null);
    publishRaid({
      mapId,
      type: "defeated",
      cells: [`${q},${r}`],
      runner: wasRunner,
      ...(reveal ? { reveal } : {}),
    });
    // Журнал карты: клетка перечитывается из базы и уходит дельтой всем
    // (map-change-hooks) — снимок и кэш игроков видят одно и то же.
    void noteCellsChanged(mapId, [`${q},${r}`]);
  }
  await logObjectRun({
    hpId: hpRow.id,
    objectId: target.templateId,
    wallet,
    accountId,
    damage: commit.dealt,
    rounds: sim.rounds,
    killed: commit.killed,
    generation,
  });

  // Награда делится ПО ТОПУ вклада (как в обычном рейде), а не достаётся
  // добившему: иначе снёсший боссу 90% HP уходил ни с чем. Подбираемые
  // объекты (сундук/шахта/артефакт) — по-прежнему тому, кто забрал.
  let rewards: Awaited<ReturnType<typeof grantEncounterRewards>> = [];
  // Цикл раздачи у карты нулевой; предмет сверх рюкзака — мешочком на клетке цели.
  const at = { mapId, cycleNo: 0, q, r };
  if (commit.killed) {
    rewards =
      target.kind === "boss"
        ? await payoutByTop({
            ...at,
            generation,
            target,
            hpId: hpRow.id,
            viewer: wallet,
          })
        : // Тот же одноразовый захват, что и у подбора: выдача по объекту
          // одна на его жизнь, кто бы сколько раз ни ударил.
          (await claimObjectPayout(hpRow.id, generation))
          ? await grantEncounterRewards(wallet, target, at)
          : [];
  }
  return { side, reveal, rewards };
}
