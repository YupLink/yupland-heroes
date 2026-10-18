import { pg } from "../db/pg";
import type { RewardTier } from "../random";

/**
 * Имена паков по id для показа в UI (в reward_tiers лежит только packId).
 *
 * Паки живут в двух таблицах: NFT-паки в `nft_packs`, чип-паки (префикс
 * `cp_`) в `chip_packs`. Спрашивать надо обе — иначе чип-пак показывается
 * безымянным «Пак».
 */
export async function fetchPackNames(packIds: Iterable<string>): Promise<Map<string, string>> {
  const ids = Array.from(new Set(Array.from(packIds).filter(Boolean)));
  const names = new Map<string, string>();
  if (ids.length === 0) return names;

  const nftIds = ids.filter((id) => !id.startsWith("cp_"));
  const chipIds = ids.filter((id) => id.startsWith("cp_"));

  if (nftIds.length > 0) {
    const { data } = await pg.nftPacks.raw().select("id,name").in("id", nftIds);
    for (const p of (data ?? []) as Array<{ id: string; name: string }>) {
      names.set(p.id, p.name);
    }
  }
  if (chipIds.length > 0) {
    const { data } = await pg.chipPacks.raw().select("id,name").in("id", chipIds);
    for (const p of (data ?? []) as Array<{ id: string; name: string }>) {
      names.set(p.id, p.name);
    }
  }
  return names;
}

/** Проставляет packName в pack-ярусы. Остальные ярусы не трогает. */
export function hydratePackNames(
  tiers: RewardTier[] | null,
  names: Map<string, string>,
): RewardTier[] | null {
  if (!tiers) return null;
  return tiers.map((t) =>
    t.kind === "pack" && t.packId ? { ...t, packName: names.get(t.packId) ?? "Пак" } : t,
  );
}

/** Собирает packId из всех pack-ярусов набора дропов. */
export function collectPackIds(tierLists: Iterable<RewardTier[] | null>): Set<string> {
  const ids = new Set<string>();
  for (const tiers of tierLists) {
    for (const t of tiers ?? []) {
      if (t.kind === "pack" && t.packId) ids.add(t.packId);
    }
  }
  return ids;
}
