import { useEffect, useRef, useState } from "react";
import { ChevronRight, Crown, MapPin } from "lucide-react";
import { metaLabel } from "@/components/heroMeta";
import { thumb } from "@/lib/image";
import type { listMyHeroes } from "@/server/api/heroes-read";
import workingSprout from "@/assets/tavern/working-sprout.webp";

type Hero = Awaited<ReturnType<typeof listMyHeroes>>[number];

/** The same square portrait and metadata the player sees on owned hero items. */
export function TavernHeroCard({
  hero,
  active,
  lang,
  onOpen,
  compact = false,
  onShowBusyField,
}: {
  hero: Hero;
  active: boolean;
  lang: "ru" | "en";
  onOpen: () => void;
  compact?: boolean;
  onShowBusyField?: (q: number, r: number) => void;
}) {
  const [showBusyTip, setShowBusyTip] = useState(false);
  const busyHit = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!showBusyTip) return;
    const hideOutside = (event: PointerEvent) => {
      if (!busyHit.current?.contains(event.target as Node)) setShowBusyTip(false);
    };
    document.addEventListener("pointerdown", hideOutside);
    return () => document.removeEventListener("pointerdown", hideOutside);
  }, [showBusyTip]);
  const identity = [hero.race, hero.specialization]
    .filter(Boolean)
    .map((value) => metaLabel(value as string, lang))
    .join(" · ");
  const fieldCoords = hero.busyField?.match(/^(-?\d+),(-?\d+)$/);
  const busyCell = fieldCoords ? { q: Number(fieldCoords[1]), r: Number(fieldCoords[2]) } : null;
  return (
    <div data-game-button="surface"
      role="button"
      tabIndex={0}
      data-tavern-hero-card
      data-compact-hero={compact || undefined}
      data-rarity={hero.rarity}
      data-active-hero={active || undefined}
      className="shrink-0 snap-start text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
      onClick={onOpen}
      onKeyDown={event => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onOpen(); } }}
      aria-label={`${active ? (lang === "ru" ? "Активный герой. " : "Active hero. ") : ""}${hero.name}, ${lang === "ru" ? "уровень" : "level"} ${hero.level}. ${identity}${hero.busyField ? (lang === "ru" ? ". Батрачит" : ". Working in a field") : ""}`}
    >
      <span data-tavern-card-art-wrap>
        <span data-tavern-card-art>
          {hero.imageUrl ? (
            <img src={thumb(hero.imageUrl, 240)} alt="" loading="lazy" />
          ) : (
            <span data-tavern-card-fallback aria-hidden="true">♞</span>
          )}
          {!compact && <span data-tavern-card-rarity>{metaLabel(hero.rarity, lang)}</span>}
          {!compact && <span data-tavern-card-crown aria-hidden="true"><Crown size={16} /></span>}
          {!compact && <span data-tavern-card-level>{hero.level} lvl</span>}
          {active && <span data-tavern-card-active>{lang === "ru" ? "Активный" : "Active"}</span>}
        </span>
        {compact && hero.busyField && <span data-tavern-card-busy-hit ref={busyHit}>
          <button type="button" data-tavern-card-busy-toggle aria-label={lang === "ru" ? `${hero.name} батрачит` : `${hero.name} is working`} aria-expanded={showBusyTip} onClick={event => { event.stopPropagation(); setShowBusyTip(value => !value); }}>
            <span data-tavern-card-busy-icon aria-hidden="true"><img src={workingSprout} alt="" /></span>
          </button>
          {showBusyTip && <span data-tavern-card-busy-tip onClick={event => event.stopPropagation()}><span>{lang === "ru" ? "Батрачит" : "Working"}</span>{busyCell && onShowBusyField && <button type="button" aria-label={lang === "ru" ? `Показать ферму героя ${hero.name} на карте` : `Show ${hero.name}'s field on map`} onClick={event => { event.stopPropagation(); onShowBusyField(busyCell.q, busyCell.r); }}><MapPin size={15} aria-hidden="true" />{lang === "ru" ? "На карте" : "On map"}</button>}</span>}
        </span>}
      </span>
      <span data-tavern-card-text>
        <strong title={hero.name}>{hero.name}</strong>
        {identity && <small title={identity}>{identity}</small>}
        {compact && <small>{lang === "ru" ? "Ур." : "Lvl"} {hero.level} · <span data-compact-rarity>{metaLabel(hero.rarity, lang)}</span></small>}
      </span>
      {compact && <ChevronRight data-compact-chevron aria-hidden="true" size={19} />}
    </div>
  );
}
