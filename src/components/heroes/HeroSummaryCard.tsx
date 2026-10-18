// Карточка героя: кто он и что у него с характеристиками.
//
// Один блок на два места — вкладку «Герой» в замке и окно героя с карты. Он
// был скопирован в оба, и правка в одном тихо расходилась со вторым: владелец
// как раз жаловался, что вне замка характеристик не видно.
import { heroAbilityLabel } from "@/lib/hero/heroAbilities";
import { useState, type ReactNode } from "react";
import { HERO_STAT_KEYS, STAT_LABELS, type HeroStatKey } from "@/lib/heroStats";
import { thumb } from "@/lib/image";
import { useLang, useT } from "@/lib/i18n";
import { metaLabel } from "@/components/heroMeta";
import { HeroRadar } from "@/components/heroes/HeroRadar";
import { HeroStatBreakdown } from "@/components/heroes/HeroStatBreakdown";
import type { HeroStats } from "@/lib/heroStats";
import { cn } from "@/lib/utils";
import { useNowTick } from "@/components/chips/chipBusy";
import { RESTING_CLASS, heroRestView } from "@/components/heroes/heroRestView";

const RARITY_COLOR: Record<string, string> = {
  rare: "#5b9bff",
  epic: "#b46bff",
  legendary: "#f5c451",
};

export type HeroSummary = {
  name: string;
  imageUrl: string | null;
  race: string | null;
  specialization: string | null;
  /** Способность героя (§8.52); нет — пусто. */
  ability?: string | null;
  rarity: string;
  level: number;
  maxLevel: number;
  restUntil?: string | null;
};

export function HeroSummaryCard({
  hero,
  stats,
  breakdown,
  radarSize = 210,
  showIdentity = true,
  compact = false,
  detailsContent,
  afterRadar,
  unframed = false,
}: {
  hero: HeroSummary;
  /** Итоговые характеристики — их рисует радар. */
  stats?: HeroStats | null;
  /** База и вклад артефактов; нет — таблицу «Откуда числа» не показываем.
   * trade — седьмой НЕбоевой стат, рисуется отдельной строкой. */
  breakdown?: {
    base: HeroStats;
    skill?: HeroStats | null;
    gear: HeroStats;
    /** Постоянные прибавки ачивок (§8.57). */
    ach?: HeroStats | null;
    /** Временные эффекты: бусты плюсом, ослабления боссов минусом. */
    effects?: HeroStats | null;
    stats: HeroStats;
    trade?: number;
    alchemy?: number;
  } | null;
  radarSize?: number;
  showIdentity?: boolean;
  compact?: boolean;
  detailsContent?: ReactNode;
  afterRadar?: ReactNode;
  unframed?: boolean;
}) {
  const t = useT();
  const lang = useLang();
  const now = useNowTick(10_000);
  const rest = heroRestView(hero.restUntil, now, t);
  const [selectedAxis, setSelectedAxis] = useState<HeroStatKey | null>(null);
  const modifiers = breakdown ? Object.fromEntries(HERO_STAT_KEYS.map(key => {
    const gear = Math.round(breakdown.gear[key]);
    const effect = Math.round(breakdown.effects?.[key] ?? 0);
    return [key, { total: gear + effect, hasParts: gear !== 0 || effect !== 0 }];
  })) : undefined;
  const Name = unframed ? "h3" : "div";
  return (
    <div data-hero-summary={compact || undefined} className={cn(unframed ? "min-w-0" : "rounded-2xl border border-border bg-secondary/20 p-3", rest.resting && RESTING_CLASS)}>
      {showIdentity && <div className="mb-1 flex items-center gap-2">
        {hero.imageUrl && (
          <img
            src={thumb(hero.imageUrl, 96, "black")}
            alt=""
            className="h-10 w-10 shrink-0 rounded-lg object-cover"
            style={{ boxShadow: `0 0 0 2px ${RARITY_COLOR[hero.rarity] ?? "#9aa4bd"}` }}
          />
        )}
        <div className="min-w-0">
          <Name className={unframed ? "break-words text-sm font-bold" : "truncate text-sm font-bold"}>{hero.name}</Name>
          <div data-hero-summary={compact || undefined} className={unframed ? "text-xs text-muted-foreground" : "truncate text-[10px] text-muted-foreground"}>
            {[hero.race, hero.specialization]
              .filter(Boolean)
              .map((v) => metaLabel(v as string, lang))
              .concat(heroAbilityLabel(hero.ability, lang) || [])
              .join(" · ")}
            {" · "}
            {rest.resting ? rest.label : t("braid.hero_lvl_short", { n: hero.level, max: hero.maxLevel })}
          </div>
        </div>
      </div>}
      {compact && stats && <div data-hero-radar>
        <div className="flex justify-center"><HeroRadar
          stats={stats}
          size={radarSize}
          modifiers={modifiers}
          selectedAxis={selectedAxis}
          onAxisSelect={breakdown ? key => setSelectedAxis(current => current === key ? null : key) : undefined}
        /></div>
        {breakdown && <p className="text-center text-[10px] text-muted-foreground">
          {lang === "ru" ? "Нажми на характеристику, чтобы увидеть состав" : "Select a stat to see its breakdown"}
        </p>}
        {selectedAxis && breakdown && <div data-stat-composition className="mt-2 flex items-center gap-2 rounded-lg border border-border bg-secondary/30 p-2 text-xs" aria-live="polite">
          <div className="shrink-0 text-[11px] font-semibold">{STAT_LABELS[selectedAxis][lang === "en" ? "en" : "ru"]}</div>
          <div className="grid min-w-0 flex-1 grid-cols-4 gap-1 text-center tabular-nums">
            {[
              { label: t("braid.hero_stats_base"), value: Math.round(breakdown.base[selectedAxis]) },
              { label: lang === "ru" ? "Артеф." : "Gear", value: Math.round(breakdown.gear[selectedAxis]), signed: true },
              { label: t("braid.hero_stats_effects"), value: Math.round(breakdown.effects?.[selectedAxis] ?? 0), signed: true },
              { label: t("braid.hero_stats_total"), value: Math.round(stats[selectedAxis]) },
            ].map(item => <div key={item.label} className="min-w-0">
              <div className="break-words text-[9px] text-muted-foreground">{item.label}</div>
              <div className="font-semibold">{item.signed && item.value > 0 ? "+" : ""}{item.value}</div>
            </div>)}
          </div>
        </div>}
      </div>}
      {compact && afterRadar}
      {compact ? (
        <details data-hero-effects className="mt-3 border-t border-border pt-1">
          <summary className="min-h-11 cursor-pointer content-center rounded text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold">
            {t("braid.hero_fx_title")}
          </summary>
          <div className="space-y-3 pt-2">
            {detailsContent}
            {(breakdown?.trade != null || breakdown?.alchemy != null) && <div data-hero-secondary-stats>
              {breakdown?.trade != null && <div><span>{t("braid.trade_stat")}</span><span>{Math.round(breakdown.trade)}</span></div>}
              {breakdown?.alchemy != null && <div><span>{lang === "ru" ? "Алхимия" : "Alchemy"}</span><span>{Math.round(breakdown.alchemy)}</span></div>}
            </div>}
          </div>
        </details>
      ) : renderDetails()}
    </div>
  );

  function renderDetails() {
    return stats && <>
      <div className="flex justify-center"><HeroRadar stats={stats} size={radarSize} /></div>
      {breakdown && <HeroStatBreakdown {...breakdown} />}
    </>;
  }
}
