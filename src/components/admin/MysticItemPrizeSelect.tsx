// Приз бокса «артефакт / герой»: конкретный из созданных или любой выбранной
// редкости (владелец, 04.11.2026) — какой именно, решается при открытии бокса.
import { useQuery } from "@tanstack/react-query";
import { adminListItems } from "@/server/api/items";
import { HERO_RARITY_STARS, ITEM_RARITIES, RARITY_RU, heroRarityOf, type ItemRarity } from "@/lib/mysticKinds";
import type { MysticTier } from "@/components/mysticShared";

const ANY = "any:";

export function MysticItemPrizeSelect({
  kind, t, onChange,
}: {
  kind: "artifact" | "hero";
  t: MysticTier;
  onChange: (patch: Partial<MysticTier>) => void;
}) {
  const items = useQuery({ queryKey: ["admin-items", kind], queryFn: () => adminListItems({ data: { kind } }) });
  const list = (items.data ?? []).filter((i) => i.active || i.id === t.itemTemplateId);
  const rarity = kind === "artifact" ? t.artifactRarity : t.heroRarity;
  const value = t.itemTemplateId ?? (rarity ? ANY + rarity : "");
  const rarityOf = (i: { rarity?: string | null; level?: number | null }) =>
    kind === "artifact" ? i.rarity : heroRarityOf(i.level);
  const countOf = (r: ItemRarity) => list.filter((i) => i.active && rarityOf(i) === r).length;
  const noun = kind === "artifact" ? "артефакт" : "героя";
  const nounPl = kind === "artifact" ? "артефактов" : "героев";
  const placeholder = items.isLoading ? "загрузка…" : list.length === 0 ? `нет созданных ${nounPl} — создай в разделе` : `— выбери ${noun} —`;

  const pick = (v: string) => {
    const r = v.startsWith(ANY) ? (v.slice(ANY.length) as ItemRarity) : undefined;
    const it = r ? undefined : list.find((x) => x.id === v);
    const rarityPatch = kind === "artifact" ? { artifactRarity: r } : { heroRarity: r };
    onChange({ itemTemplateId: it?.id, itemName: it?.name, ...rarityPatch });
  };

  return (
    <select value={value} onChange={(e) => pick(e.target.value)} className="w-full rounded-lg border border-border bg-background px-2 py-1 text-xs outline-none focus:border-gold/50">
      <option value="">{placeholder}</option>
      <optgroup label="Любой — по редкости">
        {ITEM_RARITIES.map((r) => (
          <option key={r} value={ANY + r}>
            Любой {RARITY_RU[r]}{kind === "hero" ? ` (${HERO_RARITY_STARS[r]})` : ""} · из {countOf(r)}
          </option>
        ))}
      </optgroup>
      <optgroup label={kind === "artifact" ? "Конкретный артефакт" : "Конкретный герой"}>
        {list.map((i) => <option key={i.id} value={i.id}>{i.name}{i.rarity ? ` (${i.rarity})` : i.level != null ? ` (${i.level}★)` : ""}</option>)}
      </optgroup>
    </select>
  );
}
