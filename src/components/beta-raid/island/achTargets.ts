// Куда «Показать» ведёт у ачивки на острове: ближайшее, где этим занимаются.
// Лодка и дополнительные клады — у островов с 17.10 (у старых null/пусто).
import type { AchTrackId } from "@/lib/achievements/tracks";
import type { IslandPlaces } from "@/lib/raid/island/steps";
import type { Cell } from "@/lib/raid/worldgen/geo";

export function achTarget(track: AchTrackId, p: IslandPlaces): Cell | null {
  switch (track) {
    case "lumber":
      return p.trees[0] ?? null;
    case "miner":
      return p.crystals[0] ?? null;
    case "hunter":
      return p.monsters[0] ?? null;
    case "digger": {
      // Клад под дубом или камнем не виден, пока его не срубят, — ведём к открытому.
      const covered = (d: Cell) =>
        [...p.trees, ...p.crystals].some((c) => c.q === d.q && c.r === d.r);
      return p.digs.find((d) => !covered(d)) ?? p.treasure;
    }
    case "fisher":
    case "sailor":
      return p.shipyard ?? null;
    case "minelord":
      return p.mine;
    default:
      return null;
  }
}
