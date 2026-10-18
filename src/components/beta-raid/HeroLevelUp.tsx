// Прокачка героя за лайки — один блок на два места: окно героя прямо с карты
// (HeroQuickModal) и вкладка «Герой» в замке. Копии не делаем намеренно:
// расходящиеся списки инвалидации — это ровно та жалоба владельца, из-за
// которой блок и появился («улучшил — тут не отобразилось»).
//
// ⛔ Правило «без F5»: уровень меняет ВСЁ, что герой собой закрывает — карточку
// (my-heroes), плашку бонусов и разбор статов (my-hero-gear), состояние рейда
// со скидкой шага (beta-raid-state), максимум энергии (my-energy), пачки в
// инвентаре предметов (my-game-items) и остаток лайков (my-like-balance).
// refetchType "all" — потому что часть этих ключей лежит в persist-кэше
// (yuplink-rq-cache, 24 ч) и неактивные запросы иначе остались бы вчерашними.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowUpCircle, Loader2 } from "lucide-react";
import { useLang, useT } from "@/lib/i18n";
import { humanError } from "@/lib/humanError";
import { levelUpHero, levelUpHeroTemplate } from "@/server/api/heroes";
import { myLikeBalance } from "@/server/api/likes";
import { fmtLikes } from "@/components/LikesResults";
import { invalidateHeroQueries } from "@/lib/query";
import { useNowTick } from "@/components/chips/chipBusy";
import { heroRestView } from "@/components/heroes/heroRestView";
import { HeroSkillPoints } from "@/components/heroes/HeroSkillPoints";
import type { SkillPointsHero } from "@/components/heroes/heroSkillPointsView";


/** Ровно то, что нужно для ступени: берётся из listMyHeroes как есть. */
export type LevelUpHero = Omit<SkillPointsHero, "id"> & {
  id: string | null;
  /** A dormant hero has a granted item but no hero instance yet. */
  itemId?: string | null;
  templateId?: string;
  level: number;
  maxLevel: number;
  /** Цена следующего уровня; null — потолок редкости. */
  nextCost: number | null;
  restUntil?: string | null;
};

export function HeroLevelUp({ hero, expanded = false, onLeveled }: { hero: LevelUpHero | null; expanded?: boolean; onLeveled?: (heroId: string) => void }) {
  const t = useT();
  const ru = useLang() === "ru";
  const qc = useQueryClient();
  // Тот же ключ, что у чипа лайков в шапке: второго запроса не будет, а
  // списание после прокачки увидят оба места разом.
  const likes = useQuery({
    queryKey: ["my-like-balance"],
    queryFn: () => myLikeBalance(),
    staleTime: 30_000,
  });

  const up = useMutation({
    mutationFn: (target: LevelUpHero) => target.id
      ? levelUpHero({ data: { heroId: target.id } })
      : levelUpHeroTemplate({ data: { templateId: target.templateId!, itemId: target.itemId! } }),
    onSuccess: (r) => {
      onLeveled?.(r.heroId);
      const gain = "skillGain" in r ? Number(r.skillGain) || 0 : 0;
      toast.success(gain > 0 ? t("hero.level_up_points_toast", { n: r.level, k: gain }) : t("braid.hero_level_up_toast", { n: r.level, cost: r.spentLikes }));
      invalidateHeroQueries(qc, ["my-like-balance", "my-energy"]);
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const now = useNowTick(10_000);
  if (!hero || (!hero.id && (!hero.templateId || !hero.itemId))) return null;
  const rest = heroRestView(hero.restUntil, now, t);

  const cost = hero.nextCost;
  const left = Number(likes.data?.available ?? 0);
  const capped = cost == null || hero.level >= hero.maxLevel;
  const poor = likes.isSuccess && !capped && left < cost;

  const upgradeButton = !capped && (
    <button data-game-button="legacy"
      onClick={() => up.mutate(hero)}
      disabled={up.isPending || poor || !likes.isSuccess || rest.resting}
      aria-label={expanded ? (ru ? `Повысить уровень за ${cost} лайков` : `Level up for ${cost} likes`) : undefined}
      className={expanded ? "flex min-h-11 min-w-0 flex-1 flex-col items-start justify-center gap-1 text-gold disabled:opacity-50" : "flex shrink-0 items-center gap-1.5 rounded-xl gradient-gold px-3 py-2 text-xs font-bold text-gold-foreground disabled:opacity-50"}
    >
      {expanded ? <>
        <span data-level-action className="inline-flex items-center gap-1 font-display text-[13px]">
          {up.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <span aria-hidden="true">↑</span>}
          {ru ? "Повысить" : "Level up"}
        </span>
        <span data-level-price className="text-xs font-sans">{fmtLikes(cost ?? 0)} ♥ {ru ? "за уровень" : "per level"}</span>
      </> : <>
        {up.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowUpCircle className="h-3.5 w-3.5" />}
        {t("braid.hero_level_up")}
      </>}
    </button>
  );

  return (
    <><div data-hero-level-up={expanded || undefined} className="rounded-2xl border border-gold/30 bg-gold/5 p-3">
      {expanded ? <div data-level-group-row className="flex items-center gap-2.5">
        <div data-level-group className="flex min-w-0 flex-1 items-center gap-3">
          <div data-level-current className="shrink-0">
            <span className="block text-[11px] text-muted-foreground">{ru ? "Уровень" : "Level"}</span>
            <div className="mt-1 whitespace-nowrap font-sans text-[22px] font-semibold leading-none">{hero.level}<span className="text-base font-normal text-muted-foreground">/{hero.maxLevel}</span></div>
          </div>
          {capped ? <p className="text-xs text-muted-foreground">{t("braid.hero_level_max")}</p> : upgradeButton}
        </div>
        <div data-level-balance className="shrink-0 text-right">
          <span className="block text-[11px] text-muted-foreground">{ru ? "Баланс" : "Balance"}</span>
          <div className="mt-1 whitespace-nowrap text-[13px] font-medium">{!likes.isSuccess ? "—" : left.toLocaleString(ru ? "ru-RU" : "en-US")} ♥</div>
        </div>
      </div> : <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-bold">{t("braid.hero_lvl_short", { n: hero.level, max: hero.maxLevel })}</div>
          <div className="truncate text-[10px] text-muted-foreground">
            {rest.resting ? rest.label : capped ? t("braid.hero_level_max") : `${t("braid.hero_level_cost", { n: cost })} · ${t("braid.hero_likes_left", { n: fmtLikes(left) })}`}
          </div>
        </div>
        {upgradeButton}
      </div>}
      {likes.isError && <div role="alert" className="mt-2 text-xs"><p>{ru ? "Не удалось загрузить баланс лайков." : "Unable to load likes balance."}</p><button data-game-button="secondary" type="button" className="min-h-11 text-gold" onClick={() => void likes.refetch()}>{ru ? "Повторить" : "Retry"}</button></div>}
      {poor && <p role="note" data-level-shortfall className={expanded ? "mt-2 text-xs leading-relaxed text-destructive" : "mt-1 text-[10px] text-destructive"}>{expanded
        ? (ru ? `Не хватает ${(cost! - left).toLocaleString("ru-RU")} лайков для повышения уровня.` : `You need ${(cost! - left).toLocaleString("en-US")} more likes to level up.`)
        : t("braid.hero_level_poor")}</p>}
    </div>{hero.id && <HeroSkillPoints hero={{ ...hero, id: hero.id }} />}</>
  );
}
