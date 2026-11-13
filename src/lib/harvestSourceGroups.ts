import type { MineRow } from "@/server/api/beta-raid/mine-pendings";
import { mineRowReady } from "@/lib/mineLost";

export function harvestSourceEndAt(mine: MineRow): number | null {
  const endAt = mine.mushroom?.diesAt ?? mine.v2?.breakAt ?? (
    typeof mine.maxHours === "number" && mine.maxHours > 0 && mine.capturedAt > 0
      ? mine.capturedAt + mine.maxHours * 3_600_000 : null
  );
  return endAt !== null && Number.isFinite(endAt) ? endAt : null;
}
export function harvestSourceRate(mine: MineRow, now: number): number {
  const endAt = harvestSourceEndAt(mine);
  return mine.lost || (endAt !== null && endAt <= now) ? 0 : mine.yield;
}
export function harvestSourceReady(mine: MineRow, now: number): number {
  const endAt = harvestSourceEndAt(mine);
  return mineRowReady(mine, endAt === null ? now : Math.min(now, endAt));
}
export type HarvestSourceGroup = {
  key: string; rows: MineRow[]; perHour: number; ready: number; seized: number; stopped: number;
};
/** Только одинаковые источники: шахта и гриб одного ресурса не смешиваются. */
export function groupHarvestSources(mines: MineRow[], now: number): HarvestSourceGroup[] {
  const groups = new Map<string, HarvestSourceGroup>();
  for (const mine of mines) {
    const key = JSON.stringify(mine.mushroom
      ? ["mushroom", mine.mushroom.kind]
      : ["mine", mine.resource, mine.token ?? null]);
    let group = groups.get(key);
    if (!group) {
      group = { key, rows: [], perHour: 0, ready: 0, seized: 0, stopped: 0 };
      groups.set(key, group);
    }
    group.rows.push(mine);
    group.perHour += harvestSourceRate(mine, now);
    group.ready += harvestSourceReady(mine, now);
    if (mine.lost?.kind === "capture" || mine.lost?.kind === "take") group.seized++;
    else if (mine.lost || (harvestSourceEndAt(mine) !== null && harvestSourceEndAt(mine)! <= now)) group.stopped++;
  }
  return [...groups.values()];
}
