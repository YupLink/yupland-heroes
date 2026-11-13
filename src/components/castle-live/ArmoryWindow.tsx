import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { TavernArtifacts } from "./TavernArtifacts";
import { TavernArtifactSheet } from "./TavernArtifactSheet";
import { GearSlotIcon } from "@/components/beta-raid/castle/GearPaperDoll";
import { GearPresets } from "@/components/beta-raid/gear/GearPresets";
import { ringOf, type Item } from "@/components/MysticInventoryCards";
import { stripStatSuffix } from "@/components/heroMeta";
import { thumb } from "@/lib/image";
import { useLang } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { listMyItems } from "@/server/api/items";
import { listMyHeroes } from "@/server/api/heroes-read";
import { getMySelectedHero } from "@/server/api/heroes-select";
import { heroSlots } from "@/lib/hero/heroSlots";
import { EnchantMark, enchantMarkLabel } from "@/components/EnchantMark";
import "./tavern.css";
import "./tavern-hero-cards.css";
import "./armory-window.css";

/** One armory screen for Tavern and the future Armory building. */
export function ArmoryWindow({ onBack }: { onBack: () => void }) {
  const ru = useLang() === "ru";
  const wallet = useAppStore(state => state.walletAddress);
  const heroes = useQuery({ queryKey: ["my-heroes", "view", wallet], queryFn: () => listMyHeroes(), staleTime: 30_000, gcTime: 0 });
  const selected = useQuery({ queryKey: ["my-selected-hero"], queryFn: () => getMySelectedHero() });
  const items = useQuery({ queryKey: ["my-game-items"], queryFn: () => listMyItems() });
  const [equippedOpen, setEquippedOpen] = useState(true);
  const [selectedArtifact, setSelectedArtifact] = useState<Item | null>(null);
  const heroId = selected.data?.heroId ?? null;
  const hero = heroes.data?.find(entry => entry.id === heroId);
  const equippedIds = new Set(Object.values(hero?.equipped ?? {}).filter((id): id is string => typeof id === "string"));
  const equippedOrder = new Map(hero ? heroSlots(hero.rarity).map((slot, index) => [hero.equipped?.[slot.key], index] as const) : []);
  const equippedItems = (items.data ?? []).filter(item => item.kind === "artifact" && equippedIds.has(item.id))
    .sort((a, b) => (equippedOrder.get(a.id) ?? 999) - (equippedOrder.get(b.id) ?? 999));

  return <section data-tavern-style data-armory-preview className="min-h-dvh text-foreground" aria-labelledby="castle-window-title">
    <div data-armory-content>
      <header data-armory-header>
        <button type="button" onClick={onBack} aria-label={ru ? "Назад в замок" : "Back to castle"}><ArrowLeft aria-hidden="true" size={20} /><span>{ru ? "Замок" : "Castle"}</span></button>
        <h1 id="castle-window-title">{ru ? "Оружейная" : "Armory"}</h1>
      </header>
      {heroes.isError || selected.isError ? <div role="alert" data-armory-status>
        <p>{ru ? "Не удалось загрузить героя." : "Could not load hero."}</p>
        <button type="button" data-game-button="secondary" onClick={() => { void heroes.refetch(); void selected.refetch(); }}>{ru ? "Повторить" : "Retry"}</button>
      </div> : heroes.isPending || selected.isPending || items.isPending ? <p role="status" data-armory-status>{ru ? "Загрузка…" : "Loading…"}</p>
        : <>
          <section data-armory-equipped aria-label={ru ? "Надетые артефакты" : "Equipped artifacts"}>
            <button data-armory-equipped-toggle type="button" aria-expanded={equippedOpen} onClick={() => setEquippedOpen(value => !value)}>
              <span>{hero ? `${ru ? "Надето на" : "Equipped on"} ${hero.name}` : (ru ? "Надетое" : "Equipped")}</span>
              <ChevronDown aria-hidden="true" size={18} />
            </button>
            {equippedOpen && (items.isPending ? <p role="status">{ru ? "Загрузка…" : "Loading…"}</p> : items.isError ? <p role="alert">{ru ? "Не удалось загрузить снаряжение." : "Could not load equipment."}</p> : equippedItems.length ? <div data-armory-equipped-items role="group" aria-label={ru ? "Надетые артефакты, листай вправо" : "Equipped artifacts, swipe right"}>
              {equippedItems.map(item => <button key={item.id} type="button" className="relative" style={{ borderColor: ringOf(item) }} aria-label={`${stripStatSuffix(item.name)}${item.enchantPct != null ? ` · ${enchantMarkLabel(item.enchantPct, ru)}` : ""} · ${ru ? "Надето" : "Equipped"}`} onClick={() => setSelectedArtifact(item)}>
                {item.imageUrl ? <img src={thumb(item.imageUrl, 96)} alt="" /> : <GearSlotIcon slot={item.slot ?? "Голова"} />}
                <EnchantMark pct={item.enchantPct} corner />
              </button>)}
            </div> : <p>{ru ? "У героя пока нет надетых артефактов." : "This hero has no equipped artifacts yet."}</p>)}
          </section>
          <section data-armory-gallery data-tavern-artifacts-page>
            <TavernArtifacts heroes={heroes.data ?? []} heroId={heroId} heroName={hero?.name ?? null} canEquip={!!heroId} armoryMode />
          </section>
          <section data-armory-presets data-hero-screen="gear" aria-label={ru ? "Комплекты" : "Sets"}>
            <GearPresets disabled={!heroId} referenceLayout />
          </section>
          {selectedArtifact && <TavernArtifactSheet key={selectedArtifact.id} artifact={selectedArtifact} heroId={heroId} heroName={hero?.name ?? null} canEquip={!!heroId} onClose={() => setSelectedArtifact(null)} />}
        </>}
    </div>
  </section>;
}
