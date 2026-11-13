import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ListFilter } from "lucide-react";
import { listMyItems } from "@/server/api/items";
import type { listMyHeroes } from "@/server/api/heroes-read";
import { ringOf, type Item } from "@/components/MysticInventoryCards";
import { TavernArtifactSheet } from "./TavernArtifactSheet";
import { GearSlotIcon } from "@/components/beta-raid/castle/GearPaperDoll";
import { ARTIFACT_SLOTS, metaLabel, stripStatSuffix } from "@/components/heroMeta";
import { thumb } from "@/lib/image";
import { useLang } from "@/lib/i18n";
import { freeArtifactGroups } from "./tavernItems";
import { ArtWearBar } from "@/components/ArtWearBar";
import { enchantSealText } from "@/lib/enchant/enchant";
import "./artifact-enchant.css";
import { EnchantMark } from "@/components/EnchantMark";
const RARITY_ORDER = ["legendary", "epic", "rare", "uncommon", "common"];
const rarityRank = (rarity: string | null | undefined) => {
  const index = RARITY_ORDER.indexOf(rarity ?? "common");
  return index < 0 ? RARITY_ORDER.length : index;
};

export function TavernArtifacts({ heroes, rewardItemId, heroId, heroName, canEquip, armoryMode = false }: { heroes: Awaited<ReturnType<typeof listMyHeroes>>; rewardItemId?: string; heroId: string | null; heroName: string | null; canEquip: boolean; armoryMode?: boolean }) {
  const ru = useLang() === "ru";
  const items = useQuery({ queryKey: ["my-game-items"], queryFn: () => listMyItems() });
  const rewardRef = useRef<HTMLButtonElement>(null);
  const [selectedArtifact, setSelectedArtifact] = useState<Item | null>(null);
  const [equippedHintId, setEquippedHintId] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [rarityFilter, setRarityFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statFilter, setStatFilter] = useState("");
  const [raceFilter, setRaceFilter] = useState("");
  const [specFilter, setSpecFilter] = useState("");
  const [expandedSlots, setExpandedSlots] = useState<string[]>([]);
  const [firstRowSize, setFirstRowSize] = useState(4);
  useEffect(() => {
    const media = window.matchMedia(armoryMode ? "(min-width: 320px)" : "(min-width: 360px)");
    const update = () => setFirstRowSize(media.matches ? 6 : 4);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [armoryMode]);
  const equippedIds = new Set(heroes.flatMap(hero => hero.equipped && typeof hero.equipped === "object" ? Object.values(hero.equipped) : []).filter((id): id is string => typeof id === "string"));
  const groups = [
    ...freeArtifactGroups(items.data ?? [], heroes, rewardItemId).map(group => ({ ...group, equipped: false })),
    ...(items.data ?? []).filter(item => item.kind === "artifact" && equippedIds.has(item.id)).map(item => ({ sample: item, count: 1, equipped: true })),
  ];
  const fieldOptions = (field: "statType" | "race" | "specialization") =>
    [...new Set(groups.map(group => group.sample[field]).filter((value): value is string => typeof value === "string" && value.trim().length > 0))].sort((a, b) => metaLabel(a, ru ? "ru" : "en").localeCompare(metaLabel(b, ru ? "ru" : "en"), ru ? "ru" : "en"));
  const normalizedSearch = search.trim().toLocaleLowerCase(ru ? "ru" : "en");
  const visibleGroups = groups.filter(group => {
    const item = group.sample;
    if (rarityFilter && item.rarity !== rarityFilter) return false;
    if (armoryMode && normalizedSearch && !stripStatSuffix(item.name).toLocaleLowerCase(ru ? "ru" : "en").includes(normalizedSearch)) return false;
    if (armoryMode && statFilter && item.statType !== statFilter) return false;
    if (armoryMode && raceFilter && item.race !== raceFilter) return false;
    if (armoryMode && specFilter && item.specialization !== specFilter) return false;
    return true;
  });
  const slotGroups = new Map<string, typeof groups>();
  for (const group of visibleGroups) {
    const slot = group.sample.slot ?? "";
    slotGroups.set(slot, [...(slotGroups.get(slot) ?? []), group]);
  }
  for (const artifacts of slotGroups.values()) {
    artifacts.sort((a, b) => rarityRank(a.sample.rarity) - rarityRank(b.sample.rarity) || Number(b.equipped) - Number(a.equipped));
  }
  useEffect(() => {
    if (!items.isSuccess || !rewardItemId) return;
    const rewardGroup = groups.find(group => group.sample.id === rewardItemId);
    if (rewardGroup) {
      const slot = rewardGroup.sample.slot ?? "";
      if ((slotGroups.get(slot)?.findIndex(group => group.sample.id === rewardItemId) ?? -1) >= firstRowSize) {
        setExpandedSlots(current => current.includes(slot) ? current : [...current, slot]);
      }
    }
    const frame = requestAnimationFrame(() => {
      rewardRef.current?.scrollIntoView({ block: "center" });
      rewardRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [items.isSuccess, rewardItemId, firstRowSize]);
  const orderedSlots = [
    ...ARTIFACT_SLOTS,
    ...[...slotGroups.keys()].filter(slot => !ARTIFACT_SLOTS.includes(slot as typeof ARTIFACT_SLOTS[number])),
  ];
  return (
    <section aria-labelledby="tavern-artifacts">
      <div data-artifacts-heading>
        <h2 id="tavern-artifacts" className="font-semibold">{armoryMode ? (ru ? "Артефакты" : "Artifacts") : (ru ? "Все артефакты" : "All artifacts")}</h2>
        {!armoryMode && <button data-artifacts-filter-toggle data-filter-active={rarityFilter ? "true" : undefined} data-game-button="surface" type="button" aria-label={rarityFilter ? `${ru ? "Фильтр" : "Filter"}: ${metaLabel(rarityFilter, ru ? "ru" : "en")}` : (ru ? "Фильтр по редкости" : "Filter by rarity")} aria-expanded={filterOpen} onClick={() => setFilterOpen(value => !value)}><ListFilter aria-hidden="true" size={19} /></button>}
      </div>
      {armoryMode && <div data-armory-search role="search" aria-label={ru ? "Поиск артефактов" : "Search artifacts"}>
        <div data-armory-search-row>
          <input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder={ru ? "Найти артефакт" : "Find an artifact"} aria-label={ru ? "Название артефакта" : "Artifact name"} />
          <button type="button" aria-label={ru ? "Фильтры" : "Filters"} aria-expanded={filterOpen} onClick={() => setFilterOpen(value => !value)}><ListFilter aria-hidden="true" size={19} /></button>
        </div>
        {filterOpen && <div data-armory-filter-grid role="group" aria-label={ru ? "Фильтры артефактов" : "Artifact filters"}>
          <label>{ru ? "Характеристика" : "Attribute"}<select value={statFilter} onChange={event => setStatFilter(event.target.value)}><option value="">{ru ? "Любая" : "Any"}</option>{fieldOptions("statType").map(value => <option value={value} key={value}>{metaLabel(value, ru ? "ru" : "en")}</option>)}</select><ChevronDown aria-hidden="true" size={16} /></label>
          <label>{ru ? "Раса" : "Race"}<select value={raceFilter} onChange={event => setRaceFilter(event.target.value)}><option value="">{ru ? "Любая" : "Any"}</option>{fieldOptions("race").map(value => <option value={value} key={value}>{metaLabel(value, ru ? "ru" : "en")}</option>)}</select><ChevronDown aria-hidden="true" size={16} /></label>
          <label>{ru ? "Специализация" : "Specialization"}<select value={specFilter} onChange={event => setSpecFilter(event.target.value)}><option value="">{ru ? "Любая" : "Any"}</option>{fieldOptions("specialization").map(value => <option value={value} key={value}>{metaLabel(value, ru ? "ru" : "en")}</option>)}</select><ChevronDown aria-hidden="true" size={16} /></label>
          <label>{ru ? "Редкость" : "Rarity"}<select value={rarityFilter ?? ""} onChange={event => setRarityFilter(event.target.value || null)}><option value="">{ru ? "Любая" : "Any"}</option>{RARITY_ORDER.map(value => <option value={value} key={value}>{metaLabel(value, ru ? "ru" : "en")}</option>)}</select><ChevronDown aria-hidden="true" size={16} /></label>
        </div>}
        {(search || statFilter || raceFilter || specFilter || rarityFilter) && <button data-armory-clear type="button" onClick={() => { setSearch(""); setStatFilter(""); setRaceFilter(""); setSpecFilter(""); setRarityFilter(null); }}>{ru ? "Сбросить поиск и фильтры" : "Clear search and filters"}</button>}
      </div>}
      {!armoryMode && filterOpen && <div data-artifacts-filters role="group" aria-label={ru ? "Редкость артефакта" : "Artifact rarity"}>
        {[null, "common", "uncommon", "rare", "epic", "legendary"].map(rarity => <button data-game-button="surface" type="button" key={rarity ?? "all"} aria-pressed={rarityFilter === rarity} onClick={() => { setRarityFilter(rarity); setFilterOpen(false); }}>{rarity ? metaLabel(rarity, ru ? "ru" : "en") : (ru ? "Все" : "All")}</button>)}
      </div>}
      {items.isPending || (items.isFetching && !items.isError) ? (
        <p role="status">{ru ? "Загрузка…" : "Loading…"}</p>
      ) : items.isError ? (
        <div role="alert">
          <p>{ru ? "Не удалось загрузить артефакты." : "Could not load artifacts."}</p>
          <button data-game-button="secondary" className="min-h-11 rounded border px-3" onClick={() => void items.refetch()}>
            {ru ? "Повторить" : "Retry"}
          </button>
        </div>
      ) : (
        <div data-artifact-slot-list role="region" aria-label={ru ? "Категории артефактов" : "Artifact categories"}>
          {armoryMode && visibleGroups.length === 0 && <p data-armory-empty role="status">{ru ? "По запросу артефакты не найдены." : "No artifacts match your search."}</p>}
          {rewardItemId && !groups.some(group => group.sample.id === rewardItemId) && <p role="status">{ru ? "Полученный артефакт пока не появился среди свободных." : "The rewarded artifact is not among available items yet."}</p>}
          {orderedSlots.map(slot => {
            const artifacts = slotGroups.get(slot) ?? [];
            const expanded = expandedSlots.includes(slot);
            const canExpand = artifacts.length > firstRowSize;
            return (
            <section
              data-artifact-slot
              data-empty-slot={artifacts.length === 0 ? "true" : undefined}
              key={slot}
            >
              <div data-slot-heading>
                <span data-slot-label>
                  {(!armoryMode || ARTIFACT_SLOTS.includes(slot as typeof ARTIFACT_SLOTS[number])) && <span data-slot-icon aria-hidden="true">{armoryMode ? <span data-armory-category-glyph data-icon-index={ARTIFACT_SLOTS.indexOf(slot as typeof ARTIFACT_SLOTS[number])} /> : <GearSlotIcon slot={slot || "Голова"} />}</span>}
                  <span>{slot ? metaLabel(slot, ru ? "ru" : "en") : (ru ? "Без указанного слота" : "Unspecified slot")}</span>
                  {artifacts.length > 0 && <span data-slot-count>· {artifacts.length}</span>}
                </span>
                {armoryMode && <span data-slot-rule aria-hidden="true" />}
                {canExpand && <button data-slot-expand data-game-button="surface" type="button" aria-expanded={expanded} onClick={() => setExpandedSlots(current => expanded ? current.filter(value => value !== slot) : [...current, slot])}>
                  {expanded ? (ru ? "Свернуть" : "Collapse") : (ru ? "Показать всё" : "Show all")}
                  <ChevronDown aria-hidden="true" size={16} />
                </button>}
              </div>
              {artifacts.length > 0 && <div data-slot-artifacts>
                {(expanded ? artifacts : artifacts.slice(0, firstRowSize)).map(group => (
                  <div data-artifact-tile key={group.equipped || group.sample.id === rewardItemId || group.sample.enchantPct != null ? group.sample.id : `${group.sample.templateId || group.sample.id}|${group.sample.durability ?? 100}`}>
                    <button data-inline-artifact data-game-button="surface" type="button" data-equipped-artifact={group.equipped ? "true" : undefined} data-reward-item={group.sample.id === rewardItemId ? "true" : undefined} ref={group.sample.id === rewardItemId ? rewardRef : undefined} style={{ borderColor: ringOf(group.sample) }} aria-label={`${stripStatSuffix(group.sample.name)} · ${metaLabel(group.sample.rarity, ru ? "ru" : "en")}${group.sample.enchantPct != null ? ` · ${enchantSealText(group.sample.enchantPct, ru)}` : ""}${group.equipped ? ` · ${ru ? "Надето" : "Equipped"}` : ""}${group.count > 1 ? ` · ${ru ? "Количество" : "Quantity"}: ${group.count}` : ""}${group.sample.id === rewardItemId ? ` · ${ru ? "Получен" : "Received"}` : ""}`} onClick={() => { setEquippedHintId(null); setSelectedArtifact(group.sample); }}>
                      {group.sample.imageUrl ? <img src={thumb(group.sample.imageUrl, 160)} alt="" /> : <GearSlotIcon slot={group.sample.slot ?? "Голова"} />}
                      {group.count > 1 && <span data-artifact-count>×{group.count}</span>}
                      {group.sample.enchantPct != null && <span data-artifact-enchant><EnchantMark pct={group.sample.enchantPct} /></span>}
                      <ArtWearBar durability={group.sample.durability} />
                    </button>
                    {group.equipped && <>
                      <button data-artifact-equipped-mark type="button" aria-label={ru ? "Надето" : "Equipped"} aria-expanded={equippedHintId === group.sample.id} onClick={() => setEquippedHintId(current => current === group.sample.id ? null : group.sample.id)}><Check aria-hidden="true" size={12} strokeWidth={3} /></button>
                      {equippedHintId === group.sample.id && <span data-artifact-equipped-hint role="status">{ru ? "Надето" : "Equipped"}</span>}
                    </>}
                  </div>
                ))}
              </div>}
            </section>
          );})}
        </div>
      )}
      {selectedArtifact && <TavernArtifactSheet key={selectedArtifact.id} artifact={selectedArtifact} heroId={heroId} heroName={heroName} canEquip={canEquip} onClose={() => setSelectedArtifact(null)} />}
    </section>
  );
}
