// Карточки инвентаря (квадрат + деталь) и связанные хелперы. Вынесено из
// MysticInventory (§13 ПРАВИЛА.md), чтобы главный компонент уместил фильтры.
import { createPortal } from "react-dom";
import { Gem, Crown, Moon, X } from "lucide-react";
import { listMyItems } from "@/server/api/items";
import { thumb } from "@/lib/image";
import { StatBadge, ImmunityBadges } from "@/components/itemStat";
import { useQuery } from "@tanstack/react-query";
import { heroRarity, metaLabel, stripStatSuffix } from "@/components/heroMeta";
import { artifactSummary } from "@/components/artifactSummary";
import { HeroItemPanel } from "@/components/heroes/HeroItemPanel";
import { getSession } from "@/server/api/user-auth";
import { useLang } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { RESTING_CLASS, type HeroRestView } from "@/components/heroes/heroRestView";

export type Item = Awaited<ReturnType<typeof listMyItems>>[number];

const RARITY_COLOR: Record<string, string> = {
  common: "#9aa4bd",
  uncommon: "#55a873",
  rare: "#5b9bff",
  epic: "#b46bff",
  legendary: "#f5c451",
};
// Герой: редкость и цвет — из уровня (звёзд). Артефакт: из поля rarity.
export const ringOf = (it: Item) =>
  it.kind === "hero"
    ? heroRarity(it.level).color
    : it.rarity
      ? (RARITY_COLOR[it.rarity] ?? "#9aa4bd")
      : "#41d3c6";
const badgeOf = (it: Item, lang: string) =>
  it.kind === "hero" ? heroRarity(it.level).label : metaLabel(it.rarity, lang);

export function ItemSquare({
  it,
  count = 1,
  onOpen,
  rest = null,
}: {
  it: Item;
  count?: number;
  onOpen: () => void;
  /** Герой отдыхает (снят с грядки издалека): плитка серая, с таймером. */
  rest?: HeroRestView | null;
}) {
  const lang = useLang();
  const ring = ringOf(it);
  const KindIcon = it.kind === "hero" ? Crown : Gem;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "relative overflow-hidden rounded-2xl border bg-card text-left transition hover:brightness-110",
        rest?.resting && RESTING_CLASS,
      )}
      style={{ borderColor: ring + "66" }}
    >
      <div
        className="relative aspect-square w-full bg-secondary/40"
        style={{ boxShadow: `inset 0 0 0 2px ${ring}55` }}
      >
        {count > 1 && (
          <span className="absolute bottom-1.5 right-1.5 z-10 grid min-w-[20px] place-items-center rounded-full border border-background bg-gold px-1 text-[11px] font-extrabold leading-tight text-background">
            ×{count}
          </span>
        )}
        {it.imageUrl ? (
          <img src={thumb(it.imageUrl, 240)} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full place-items-center text-2xl" style={{ color: ring }}>
            {it.kind === "hero" ? "♞" : "◆"}
          </div>
        )}
        {/* редкость (у героя — из звёзд авто) */}
        {badgeOf(it, lang) && (
          <span
            className="absolute left-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold"
            style={{ background: ring + "22", color: ring }}
          >
            {badgeOf(it, lang)}
          </span>
        )}
        {/* Правый-верхний: артефакт → характеристика (щит/меч + число);
            герой → корона (вид; редкость = цвет кольца). */}
        {it.kind === "artifact" && it.statType ? (
          <span className="absolute right-1.5 top-1.5">
            <StatBadge stat={it.statType} amount={it.statAmount} />
          </span>
        ) : (
          <span
            className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-black/55"
            style={{ color: ring }}
          >
            <KindIcon className="h-3 w-3" />
          </span>
        )}
        {/* Левый нижний угол у героя — уровень прокачки (просили вместо
            специализации: по нему же идут отдельные пачки). */}
        {it.kind === "hero" && !rest?.resting && (
          <span className="absolute bottom-1.5 left-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[9px] font-bold text-gold">
            {(it as { heroLevel?: number | null }).heroLevel ?? 0} lvl
          </span>
        )}
        {/* Отдых — таймер на месте уровня: на телефоне плитка в 100 px, и
            рядом с уровнем «2 ч 59 мин» на него наезжал. */}
        {rest?.resting && (
          <span className="absolute bottom-1.5 left-1.5 flex items-center gap-0.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[9px] font-bold text-white">
            <Moon className="h-2.5 w-2.5" />
            {rest.left}
          </span>
        )}
        {it.kind === "artifact" && (it.immunities?.length ?? 0) > 0 && (
          <ImmunityBadges
            immunities={it.immunities}
            lang={lang}
            className="absolute bottom-1.5 left-1.5"
          />
        )}
      </div>
      <div className="p-2">
        <div className="truncate text-xs font-semibold">{stripStatSuffix(it.name)}</div>
        {it.kind === "hero" && (it.race || it.specialization) && (
          <div className="truncate text-[10px] text-muted-foreground">
            {[it.race, it.specialization]
              .filter(Boolean)
              .map((v) => metaLabel(v, lang))
              .join(" · ")}
          </div>
        )}
      </div>
    </button>
  );
}

export function ItemDetail({ it, onClose }: { it: Item; onClose: () => void }) {
  const lang = useLang();
  // Прокачка героя пока тестируется на админах (см. api/heroes.ts).
  const session = useQuery({ queryKey: ["session"], queryFn: () => getSession() });
  const ring = ringOf(it);
  const kindLabel =
    it.kind === "hero"
      ? lang === "en"
        ? "Hero"
        : "Герой"
      : lang === "en"
        ? "Artifact"
        : "Артефакт";
  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[88dvh] w-full max-w-sm overflow-y-auto overscroll-contain rounded-t-3xl border bg-card pb-[calc(env(safe-area-inset-bottom)+84px)] sm:max-h-[90vh] sm:rounded-3xl sm:pb-0"
        style={{ borderColor: ring + "77" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="relative aspect-square w-full bg-secondary/40"
          style={{ boxShadow: `inset 0 0 0 3px ${ring}55` }}
        >
          {it.imageUrl ? (
            <img src={thumb(it.imageUrl, 520)} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full place-items-center text-6xl" style={{ color: ring }}>
              {it.kind === "hero" ? "♞" : "◆"}
            </div>
          )}
          <button
            onClick={onClose}
            className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-black/60 text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-2 p-4">
          <div className="flex items-center gap-2">
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-bold"
              style={{ background: ring + "22", color: ring }}
            >
              {kindLabel}
              {badgeOf(it, lang) ? ` · ${badgeOf(it, lang)}` : ""}
            </span>
          </div>
          <div className="text-lg font-bold">{stripStatSuffix(it.name)}</div>
          {it.kind === "hero" && (it.race || it.specialization) && (
            <div className="text-sm text-foreground/80">
              {[it.race, it.specialization]
                .filter(Boolean)
                .map((v) => metaLabel(v, lang))
                .join(" · ")}
            </div>
          )}
          {it.kind === "artifact" && (it.immunities?.length ?? 0) > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-foreground/80">
              <ImmunityBadges immunities={it.immunities} lang={lang} />
              <span>{(it.immunities ?? []).map((v) => metaLabel(v, lang)).join(", ")}</span>
            </div>
          )}
          {it.kind === "hero" && it.templateId && (
            <HeroItemPanel
              templateId={it.templateId}
              itemId={it.id}
              canLevelUp={!!session.data?.features?.hero_levels}
            />
          )}
          {/*
            У артефакта характеристики ВСЕГДА собираем сами — они переводятся
            на язык игрока. Текст из базы для них не берём: у части предметов
            он вписан по-русски, у части по-английски, и в инвентаре выходила
            каша из двух языков (жалоба игрока 24.08). Своё описание остаётся
            у остальных предметов — там это осмысленный текст, а не статы.
          */}
          {(() => {
            const summary = it.kind === "artifact" ? artifactSummary(it, lang) : "";
            const text = summary || it.description || "";
            return text ? (
              <div className="whitespace-pre-wrap text-sm text-muted-foreground">{text}</div>
            ) : null;
          })()}
        </div>
      </div>
    </div>,
    document.body,
  );
}
