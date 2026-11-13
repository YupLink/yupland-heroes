import { convertRuleForChipLevel } from "@/lib/heroLevels";
/** Exclude the exact equipped copy across every owned hero before grouping.
 *  Разная прочность — разные плитки: у каждой своя полоса износа. */
export function freeArtifactGroups<
  T extends { id: string; kind: string; templateId: string; durability?: number | null; enchantPct?: number | null },
>(
  items: T[],
  heroes: { equipped?: unknown }[],
  rewardItemId?: string,
) {
  const worn = new Set(
    heroes.flatMap((h) =>
      h.equipped && typeof h.equipped === "object" ? Object.values(h.equipped) : [],
    ),
  );
  const groups = new Map<string, { sample: T; count: number }>();
  for (const item of items) {
    if (item.kind !== "artifact" || worn.has(item.id)) continue;
    const key =
      item.id === rewardItemId
        ? `reward:${item.id}`
        : item.enchantPct != null
          ? `ench:${item.id}` // зачарованный — своей плиткой (§8.87)
          : `${item.templateId || item.id}|${item.durability ?? 100}`;
    const group = groups.get(key);
    if (group) group.count++;
    else groups.set(key, { sample: item, count: 1 });
  }
  return [...groups.values()];
}
export function heroCandidates<T extends { id: string }>(
  groups: {
    level: number;
    templateName: string;
    imageUrl: string | null;
    chipIds: string[];
    chips: T[];
  }[],
) {
  return groups.flatMap((group) => {
    if (group.level < 3 || !convertRuleForChipLevel(group.level)) return [];
    const owned = new Set(group.chipIds);
    return group.chips
      .filter((chip) => owned.has(chip.id))
      .map((chip) => ({
        chip,
        level: group.level,
        name: group.templateName,
        imageUrl: group.imageUrl,
      }));
  });
}
