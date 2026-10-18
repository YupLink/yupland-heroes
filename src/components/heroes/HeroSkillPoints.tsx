// Очки навыков повышенных уровней: игрок сам выбирает, куда положить очко
// (владелец, 02.10.2026: «прикачать себе плюс одну торговлю — просто выбрать
// сам; каждый навык можно выбрать»). Восемь строк — шесть статов, Торговля и
// Алхимия; «+» кладёт одно очко. Сброса нет.
//
// Живёт рядом с прокачкой (HeroLevelUp: окно героя с карты, вкладка замка,
// таверна) и в карточке героя из инвентаря. После «+» перечитываем тот же
// геройский список, что и прокачка, — статы, рюкзак и сумка зелий растут без F5.
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLang, useT } from "@/lib/i18n";
import { humanError } from "@/lib/humanError";
import { invalidateHeroQueries } from "@/lib/query";
import { STAT_LABELS } from "@/lib/heroStats";
import type { HeroSkillKey } from "@/lib/hero/heroSkills";
import { spendSkillPoint } from "@/server/api/heroes-skill";
import {
  canAddSkill,
  skillPointsView,
  type SkillPointsFresh,
  type SkillPointsHero,
} from "@/components/heroes/heroSkillPointsView";

type Spend = { heroId: string; skill: HeroSkillKey; from: number };

export function HeroSkillPoints({ hero }: { hero: SkillPointsHero }) {
  const t = useT();
  const lang = useLang() === "en" ? "en" : "ru";
  const qc = useQueryClient();
  // Ответ «+» держим, пока список не перечитался: иначе второй быстрый тап
  // ушёл бы со старым from, и сервер принял бы его за повтор первого.
  const [fresh, setFresh] = useState<SkillPointsFresh | null>(null);

  const spend = useMutation({
    mutationFn: (v: Spend) => spendSkillPoint({ data: v }),
    onSuccess: (r, v) => {
      setFresh({ heroId: v.heroId, skills: r.skills, earned: r.earned });
      // Лайки очко не тратит; энергия — как у прокачки: её максимум от статов.
      invalidateHeroQueries(qc, ["my-energy"]);
    },
    onError: (e: Error) => {
      toast.error(humanError(e));
      // «Уже изменилось» — значит, в другом окне вложили: подтягиваем числа.
      invalidateHeroQueries(qc);
    },
  });

  const view = skillPointsView(hero, fresh);
  if (!view) return null;
  const can = canAddSkill(view, spend.isPending);
  const label = (k: HeroSkillKey): string =>
    k === "trade"
      ? t("braid.trade_stat")
      : k === "alchemy"
        ? t("braid.alchemy_stat")
        : STAT_LABELS[k][lang];

  return (
    <div className="rounded-2xl border border-border bg-secondary/20 p-3">
      <div className="mb-2 flex items-center justify-between gap-2 text-xs font-bold">
        <span>
          {t("hero.skill_points")}{" "}
          <span
            className={cn("tabular-nums", view.free > 0 ? "text-gold" : "text-muted-foreground")}
          >
            {view.free}
          </span>
        </span>
        {spend.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin text-gold" />}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {view.rows.map(({ key, spent }) => (
          <div
            key={key}
            className="flex min-w-0 items-center justify-between gap-1 rounded-lg bg-secondary/40 py-1 pl-2 pr-1"
          >
            <span className="min-w-0 truncate text-[11px]">{label(key)}</span>
            <span className="flex shrink-0 items-center gap-1">
              <span
                className={cn(
                  "text-[11px] tabular-nums",
                  spent > 0 ? "text-success" : "text-muted-foreground",
                )}
              >
                {spent > 0 ? `+${spent}` : "0"}
              </span>
              <button
                type="button"
                onClick={() => spend.mutate({ heroId: hero.id, skill: key, from: spent })}
                disabled={!can}
                aria-label={t("hero.skill_add", { skill: label(key) })}
                className="grid h-8 w-8 place-items-center rounded-md gradient-gold text-gold-foreground transition active:scale-95 disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
