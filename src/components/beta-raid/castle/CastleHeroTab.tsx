// Вкладка «Герой»: кто сейчас основной, его характеристики и смена.
// В замке смена бесплатна по времени — суточный кулдаун тут не действует,
// иначе первый же неудачный выбор запирал бы игрока на сутки.
import { useState, type ReactNode } from "react";
import { Check, Loader2, Sprout } from "lucide-react";
import { cn } from "@/lib/utils";
import { thumb } from "@/lib/image";
import { useLang, useT } from "@/lib/i18n";
import { metaLabel } from "@/components/heroMeta";
import { RARITY_COLOR } from "@/components/heroes/heroLabels";
import { HeroLevelUp } from "@/components/beta-raid/HeroLevelUp";
import type { Castle } from "./useCastle";
import { HeroEffectSummary } from "../HeroEffectSummary";
import { heroCombat, heroField } from "@/lib/hero/heroPowerCurve";
import { HeroSummaryCard } from "@/components/heroes/HeroSummaryCard";
import { isCurrentHero, isFramedHero } from "@/components/beta-raid/heroPickFrame";
import { FieldRecallConfirm } from "@/components/beta-raid/FieldRecallConfirm";
import { useNowTick } from "@/components/chips/chipBusy";
import { HeroRestBadge } from "@/components/heroes/HeroRestBadge";
import { RESTING_CLASS, heroRestView } from "@/components/heroes/heroRestView";

export function CastleHeroTab({
  castle,
  atCastle,
  allowLevelUp = false,
  prioritizeLevelUp = false,
  heroAction,
}: {
  castle: Castle;
  atCastle: boolean;
  allowLevelUp?: boolean;
  prioritizeLevelUp?: boolean;
  heroAction?: ReactNode;
}) {
  const t = useT();
  const lang = useLang();
  // У спящего героя (лежит предметом) id ещё нет — держим и шаблон.
  const [pending, setPending] = useState<{
    id: string | null;
    templateId: string;
    itemId?: string | null;
  } | null>(null);
  // Батрачащий герой: предлагаем снять его с грядки прямо отсюда — даром, но
  // потом он отдыхает.
  const [recall, setRecall] = useState<{ id: string; at: string } | null>(null);
  // Один тик на экран: по нему отдыхающие гаснут и оживают без F5.
  const now = useNowTick(10_000);

  const heroes = castle.heroes.data ?? [];
  const heroId = castle.viewedHeroId ?? castle.selected.data?.heroId ?? null;
  const chosen = heroes.find((h) => h.id === heroId) ?? null;
  const gear = castle.gear.data;
  // Со снаряжением статы приходят с сервера; без флага — базовые из списка.
  const viewedInactive = !!castle.viewedHeroId && castle.selected.data?.heroId !== castle.viewedHeroId;
  const stats = viewedInactive ? (chosen?.stats ?? null) : gear?.heroId ? gear.stats : (chosen?.stats ?? null);
  const pick = castle.mut.pickHero;

  const levelUp = (!castle.readOnly || allowLevelUp) && (
    <HeroLevelUp hero={chosen && chosen.id ? { ...chosen, id: chosen.id } : null} />
  );
  return (
    <div className="space-y-3">
      {prioritizeLevelUp && (!castle.readOnly || allowLevelUp) && (
        <HeroLevelUp expanded hero={chosen && chosen.id ? { ...chosen, id: chosen.id } : null} />
      )}
      {chosen ? (
        <HeroSummaryCard
          hero={chosen}
          showIdentity={!prioritizeLevelUp}
          radarSize={prioritizeLevelUp ? 300 : 210}
          compact={prioritizeLevelUp}
          afterRadar={heroAction}
          detailsContent={prioritizeLevelUp && (viewedInactive
            ? <HeroEffectSummary compact combat={heroCombat(chosen.stats)} field={heroField(chosen.stats)} />
            : gear?.heroId ? <HeroEffectSummary compact combat={gear.combat} field={gear.field} /> : undefined)}
          stats={stats}
          breakdown={
            gear?.heroId && !viewedInactive
              ? {
                  base: gear.base,
                  skill: gear.skill,
                  gear: gear.gear,
                  ach: gear.ach,
                  effects: gear.effects,
                  stats: gear.stats,
                  trade: gear.trade ?? 0,
                  alchemy: (gear as typeof gear & { alchemy?: number }).alchemy,
                }
              : null
          }
        />
      ) : (
        <p className="rounded-xl border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
          {t("braid.castle_no_hero")}
        </p>
      )}

      {/* Прокачка и в замке тоже: тот же блок, что в окне героя с карты —
          один список инвалидации на оба места, иначе карточка выше опять
          показывала бы старый уровень (жалоба владельца 27.08). */}
      {/* Спящего героя (без экземпляра) качать нечего — сперва выбери его. */}
      {!prioritizeLevelUp && (!castle.readOnly || allowLevelUp) && (
        <HeroLevelUp hero={chosen && chosen.id ? { ...chosen, id: chosen.id } : null} />
      )}

      {!castle.readOnly && (
        <p className="text-[11px] text-muted-foreground">{t("braid.castle_switch_free")}</p>
      )}

      {castle.readOnly ? null : castle.heroes.isLoading ? (
        <div className="flex h-24 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-gold" />
        </div>
      ) : heroes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
          {t("braid.no_heroes")}
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {heroes.map((h) => {
            // Галочка — у основного, рамка — сразу у тапнутого (дальше «Подтвердить»).
            const active = isCurrentHero(h, heroId);
            const framed = isFramedHero(h, pending, heroId);
            // Отдыхающий (снят с грядки издалека) — серый и не нажимается.
            const rest = heroRestView(h.restUntil, now, t);
            return (
              <button data-game-button="surface"
                key={h.id ?? h.itemId ?? h.templateId}
                disabled={rest.resting}
                onClick={() => {
                  // Батрачащего в основные не берут — вместо тупика «сначала
                  // сними с поля» предлагаем снять его отсюда (даром, с отдыхом).
                  const busy = h.busyField && h.id ? { id: h.id, at: h.busyField } : null;
                  setRecall(busy);
                  setPending(
                    busy || active
                      ? null
                      : { id: h.id, templateId: h.templateId, itemId: h.itemId },
                  );
                }}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-xl border p-2 transition",
                  framed ? "border-gold bg-gold/10" : "border-border hover:border-gold/40",
                  h.busyField && "opacity-60",
                  rest.resting && RESTING_CLASS,
                )}
              >
                <div
                  className="relative h-14 w-14 overflow-hidden rounded-lg bg-secondary/40"
                  style={{ boxShadow: `0 0 0 2px ${RARITY_COLOR[h.rarity] ?? "#9aa4bd"}` }}
                >
                  {h.imageUrl && (
                    <img
                      src={thumb(h.imageUrl, 120, "black")}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  )}
                  {active && (
                    <span className="absolute bottom-0 right-0 grid h-5 w-5 place-items-center rounded-tl-lg bg-gold text-gold-foreground">
                      <Check className="h-3 w-3" />
                    </span>
                  )}
                  {/* Работает на грядке — значок ростка поверх портрета. */}
                  {h.busyField && (
                    <span className="absolute left-0 top-0 grid h-5 w-5 place-items-center rounded-br-lg bg-emerald-500 text-black">
                      <Sprout className="h-3 w-3" />
                    </span>
                  )}
                  {rest.resting && <HeroRestBadge />}
                </div>
                {/* Раса и специализация вместо имени — по ним и выбирают. */}
                <span className="w-full truncate text-center text-[10px] leading-tight">
                  {[h.race, h.specialization]
                    .filter(Boolean)
                    .map((v) => metaLabel(v as string, lang))
                    .join(" · ") || "—"}
                </span>
                <span className="text-[9px] text-muted-foreground">
                  {rest.resting
                    ? rest.label
                    : h.busyField
                      ? t("braid.hero_at_field")
                      : t("braid.hero_lvl_short", { n: h.level, max: h.maxLevel })}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {pending && !castle.readOnly && (
        <div className="space-y-2 rounded-xl border border-gold/40 bg-gold/5 p-3">
          <p className="text-xs">{t("braid.castle_make_main_q")}</p>
          <div className="flex gap-2">
            <button data-game-button="primary"
              onClick={() => pick.mutate(pending, { onSuccess: () => setPending(null) })}
              disabled={pick.isPending || !atCastle}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl gradient-gold px-3 py-2 text-xs font-bold text-gold-foreground disabled:opacity-50"
            >
              {pick.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {t("common.confirm")}
            </button>
            <button data-game-button="secondary"
              onClick={() => setPending(null)}
              className="rounded-xl border border-border px-3 py-2 text-xs text-muted-foreground"
            >
              {t("common.cancel")}
            </button>
          </div>
        </div>
      )}

      {recall && !castle.readOnly && (
        <FieldRecallConfirm heroId={recall.id} at={recall.at} onClose={() => setRecall(null)} />
      )}
    </div>
  );
}
