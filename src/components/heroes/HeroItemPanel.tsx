// Герой в инвентаре: диаграмма характеристик и прокачка уровня прямо в
// карточке предмета — отдельная вкладка «Герои» для этого не нужна.
//
// Кнопка «i» раскрывает, что даст следующий уровень и сколько он стоит.
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowUpCircle, Info, Loader2, UserCheck } from "lucide-react";
import { toast } from "sonner";
import {
  heroCardForTemplate,
  levelUpHeroTemplate,
  selectMyHero,
  getMySelectedHero,
} from "@/server/api/heroes";
import { getSession } from "@/server/api/user-auth";
import { useLang, useT } from "@/lib/i18n";
import { HeroRadar } from "./HeroRadar";
import { RARITY_LABEL } from "./heroLabels";
import { HERO_STAT_KEYS, STAT_LABELS } from "@/lib/heroStats";
import { humanError } from "@/lib/humanError";
import { invalidateHeroQueries } from "@/lib/query";
import { cn } from "@/lib/utils";
import { useNowTick } from "@/components/chips/chipBusy";
import { RESTING_CLASS, heroRestView } from "./heroRestView";
import { HeroSkillPoints } from "@/components/heroes/HeroSkillPoints";

export function HeroItemPanel({
  templateId,
  itemId,
  canLevelUp,
}: {
  templateId: string;
  /** Копия предмета: качаем именно её, а не самого прокачанного тёзку. */
  itemId?: string | null;
  /** Прокачка открыта админам и тестерам с включённым переключателем. */
  canLevelUp: boolean;
}) {
  const qc = useQueryClient();
  const t = useT();
  const lang = useLang();
  const [info, setInfo] = useState(false);

  // В режиме героя основного меняют ТОЛЬКО в замке (сервер этого и требует),
  // поэтому кнопка отсюда всегда падала бы тостом — показываем это заранее.
  const session = useQuery({ queryKey: ["session"], queryFn: () => getSession() });
  const heroMode = !!session.data?.features?.hero_power;

  const card = useQuery({
    // itemId в ключе и в запросе: карточка обязана показывать ТУ копию, что
    // открыта, — иначе она рисует прокачанного тёзку, а кнопка качает эту.
    queryKey: ["hero-card", templateId, itemId ?? null],
    queryFn: () => heroCardForTemplate({ data: { templateId, ...(itemId ? { itemId } : {}) } }),
  });

  // Выбранный герой ходит по карте рейда своей расой.
  const selected = useQuery({
    queryKey: ["my-selected-hero"],
    queryFn: () => getMySelectedHero(),
  });

  const choose = useMutation({
    mutationFn: (heroId: string | null) => selectMyHero({ data: { heroId } }),
    onSuccess: (r) => {
      toast.success(t(r.heroId ? "heroes.picked_toast" : "heroes.unpicked_toast"));
      // Со сменой основного меняется всё: фигурка на карте, плашка бонусов,
      // отряд и снаряжение (они висят на герое). refetchType: "all" внутри —
      // карта могла быть уже открыта в соседнем экране и «устарело» её бы не
      // перерисовало.
      invalidateHeroQueries(qc);
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const levelUp = useMutation({
    mutationFn: () => levelUpHeroTemplate({ data: { templateId, ...(itemId ? { itemId } : {}) } }),
    onSuccess: (r) => {
      toast.success(`Уровень ${r.level} · −${r.spentLikes}`);
      // Уровень виден в четырёх местах сразу: карточка предмета, список героев,
      // карточка в замке, стопки инвентаря (он стакает героев по уровню — после
      // прокачки один выходит из стопки отдельной карточкой). Раньше правился
      // только тот экран, откуда нажали, и в замке висел прежний уровень.
      invalidateHeroQueries(qc, ["my-like-balance"]);
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });
  // Отдых после снятия с грядки: тик гасит и оживляет кнопки сам.
  const now = useNowTick(10_000);

  if (card.isLoading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }
  const h = card.data;
  if (!h) return null;

  const atMax = h.nextCost == null;
  const isChosen = !!h.heroId && selected.data?.heroId === h.heroId;
  // Отдыхающий серый и ничего не делает: ни «на карту», ни прокачки.
  const rest = heroRestView(h.restUntil, now, t);
  // Что именно прибавится на следующем уровне — показываем только реальный рост.
  const gains = HERO_STAT_KEYS.map((k) => ({ k, d: h.statsNext[k] - h.stats[k] })).filter(
    (g) => g.d > 0,
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>
          {RARITY_LABEL[h.rarity] ?? h.rarity} · ур. {h.level}/{h.maxLevel}
          {rest.resting && ` · ${rest.label}`}
        </span>
        <button
          onClick={() => setInfo((v) => !v)}
          className="grid h-6 w-6 place-items-center rounded-full border border-border transition hover:text-foreground"
          title="Что даст уровень"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className={cn("flex justify-center", rest.resting && RESTING_CLASS)}>
        <HeroRadar stats={h.stats} size={210} />
      </div>

      {info && (
        <div className="rounded-xl border border-border bg-secondary/30 p-2.5 text-[11px]">
          {atMax ? (
            <span className="text-muted-foreground">Максимальный уровень достигнут.</span>
          ) : (
            <>
              <div className="mb-1 font-medium">
                {t("heroes.next_level_cost", { n: h.level + 1, c: h.nextCost ?? 0 })}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground">
                {gains.map((g) => (
                  <span key={g.k}>
                    {STAT_LABELS[g.k][lang === "en" ? "en" : "ru"]} +{g.d}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {h.heroId && (
        <button
          onClick={() => !heroMode && choose.mutate(isChosen ? null : h.heroId!)}
          disabled={heroMode || choose.isPending || rest.resting}
          title={heroMode ? t("braid.castle_only") : undefined}
          className={`flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-bold transition active:scale-[0.99] disabled:opacity-50 ${
            isChosen
              ? "border border-gold/40 bg-gold/10 text-gold"
              : "border border-border bg-secondary/40"
          }`}
        >
          {choose.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <UserCheck className="h-4 w-4" />
          )}
          {t(isChosen ? "heroes.on_map_remove" : "heroes.pick_for_map")}
        </button>
      )}

      {/* Почему кнопка не нажимается: смена основного героя живёт в замке. */}
      {h.heroId && heroMode && (
        <div className="text-center text-[11px] text-muted-foreground">
          {t("braid.castle_only")}
        </div>
      )}

      {canLevelUp && !atMax && (
        <button
          onClick={() => levelUp.mutate()}
          disabled={levelUp.isPending || rest.resting}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl gradient-gold px-3 py-2.5 text-xs font-bold text-gold-foreground transition active:scale-[0.99] disabled:opacity-50"
        >
          {levelUp.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowUpCircle className="h-4 w-4" />
          )}
          Уровень {h.level + 1} · {h.nextCost}
        </button>
      )}

      {/* Очки навыков повышенных уровней — тот же блок, что в замке. Поля
          приходят с карточкой как есть; в старом кэше их нет — блока нет. */}
      {canLevelUp && h.heroId && <HeroSkillPoints hero={{ ...h, id: h.heroId }} />}
    </div>
  );
}
