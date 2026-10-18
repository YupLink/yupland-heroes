import { useEffect, useRef, useState } from "react";
import { ChevronRight, Crown } from "lucide-react";
import { metaLabel } from "@/components/heroMeta";
import { thumb } from "@/lib/image";
import type { listMyHeroes } from "@/server/api/heroes-read";
import workingSprout from "@/assets/tavern/working-sprout.png";

type Hero = Awaited<ReturnType<typeof listMyHeroes>>[number];

/** The same square portrait and metadata the player sees on owned hero items. */
export function TavernHeroCard({
  hero,
  active,
  lang,
  onOpen,
  compact = false,
}: {
  hero: Hero;
  active: boolean;
  lang: "ru" | "en";
  onOpen: () => void;
  compact?: boolean;
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
  return (
    <button data-game-button="surface"
      type="button"
      data-tavern-hero-card
      data-compact-hero={compact || undefined}
      data-rarity={hero.rarity}
      data-active-hero={active || undefined}
      className="shrink-0 snap-start text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
      onClick={onOpen}
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
        {compact && hero.busyField && <span data-tavern-card-busy-hit ref={busyHit} onClick={event => { event.stopPropagation(); setShowBusyTip(value => !value); }}>
          <span data-tavern-card-busy-icon aria-hidden="true"><img src={workingSprout} alt="" /></span>
          {showBusyTip && <span data-tavern-card-busy-tip aria-hidden="true">{lang === "ru" ? "Батрачит" : "Working"}</span>}
        </span>}
      </span>
      <span data-tavern-card-text>
        <strong title={hero.name}>{hero.name}</strong>
        {identity && <small title={identity}>{identity}</small>}
        {compact && <small>{lang === "ru" ? "Ур." : "Lvl"} {hero.level} · <span data-compact-rarity>{metaLabel(hero.rarity, lang)}</span></small>}
      </span>
      {compact && <ChevronRight data-compact-chevron aria-hidden="true" size={19} />}
    </button>
  );
}
