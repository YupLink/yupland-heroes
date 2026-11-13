// Повержены взрывом динамита — смерть как от удара (encounter-attack): событие
// «повержен» (под добитым объектом мог прятаться беглец — показываем его),
// дельта клетки из базы, награда — по топу вклада у босса (урон бросившего уже
// записан функцией базы), одна на жизнь объекта (claimObjectPayout). Уборка
// клетки и респавн — обходы dead-sweep и mob-spawn, как после удара.
//
// Цель собирается тем же путём, что у удара: шаблон, а нет его — снимок клетки,
// правки клетки (награды, запас) — из object_config на момент взрыва: к
// повтору нажатия уборка могла уже снять объект с клетки.
import { publishRaid } from "@/server/raidLive";
import { loadEncounterTarget, type EncounterTarget } from "@/server/api/beta-raid/encounter-target";
import { parseBossSnapshot, targetFromSnapshot } from "@/server/api/beta-raid/boss-snapshot";
import { applyCellOverride, parseOverride, priceOnMap } from "@/server/api/beta-raid/cell-override";
import { claimObjectPayout, payoutByTop } from "@/server/api/beta-raid/encounter-payout";
import {
  grantEncounterRewards,
  type GrantedReward,
} from "@/server/api/beta-raid/encounter-rewards";
import { noteCellsChanged } from "@/server/api/beta-raid/map-change-hooks";
import { revealRunnerAt } from "@/server/api/beta-raid/runner-reveal";
import { RUNNER_LAYER } from "@/server/api/beta-raid/runners";
import type { BlastHit } from "@/server/api/beta-raid/dynamite/dynamite-sql";

/** Цель удара по записи взрыва; шаблона и снимка нет — null (награды нечем считать). */
export async function blastTarget(h: BlastHit, mapId: string): Promise<EncounterTarget | null> {
  const tpl =
    (await loadEncounterTarget(h.obj)) ?? targetFromSnapshot(h.obj, parseBossSnapshot(h.cfg));
  if (!tpl) return null;
  return priceOnMap(applyCellOverride(tpl, parseOverride(h.cfg)), mapId);
}

/** Награда за одного поверженного: босс — по топу, прочее — добившему. */
async function payKill(mapId: string, wallet: string, h: BlastHit): Promise<GrantedReward[]> {
  const target = await blastTarget(h, mapId);
  if (!target) return [];
  const at = { mapId, cycleNo: 0, q: h.q, r: h.r };
  if (target.kind === "boss") {
    return payoutByTop({ ...at, generation: h.gen, target, hpId: h.hp, viewer: wallet });
  }
  return (await claimObjectPayout(h.hp, h.gen)) ? grantEncounterRewards(wallet, target, at) : [];
}

/**
 * Разослать поверженных и выдать награды. Возвращает добычу бросившего (как
 * окно итога боя). Сбой награды одной цели не мешает остальным: повтор того же
 * нажатия выдаст недоданное — выдача одна на жизнь объекта.
 */
export async function settleKills(o: {
  mapId: string;
  wallet: string;
  hits: readonly BlastHit[];
}): Promise<GrantedReward[]> {
  const killed = o.hits.filter((h) => h.killed && h.hp);
  if (killed.length === 0) return [];
  const cells: string[] = [];
  for (const h of killed) {
    const cell = `${h.q},${h.r}`;
    cells.push(cell);
    const runner = h.layer === RUNNER_LAYER;
    // Добит верхний — под ним мог прятаться живой беглец: показать сразу.
    const reveal = runner ? null : await revealRunnerAt(o.mapId, h.q, h.r).catch(() => null);
    publishRaid({
      mapId: o.mapId,
      type: "defeated",
      cells: [cell],
      runner,
      ...(reveal ? { reveal } : {}),
    });
  }
  void noteCellsChanged(o.mapId, cells);
  const mine: GrantedReward[] = [];
  for (const h of killed) {
    const got = await payKill(o.mapId, o.wallet, h).catch((e) => {
      console.warn("[dynamite] награда не выдана:", h.hp, e instanceof Error ? e.message : e);
      return [] as GrantedReward[];
    });
    mine.push(...got);
  }
  return mine;
}
