// Откуда у героя числа: «база + артефакты = итого» по шести характеристикам.
//
// Радар показывает только итог, и владелец не видел, что из этого дала раса с
// уровнем, а что — надетые предметы: со стороны характеристики выглядели
// закрытыми. Таблица маленькая нарочно — она живёт под радаром на телефоне.
//
// Считать здесь нечего: base, skill (очки повышенных уровней) и gear приходят
// с сервера из effectiveHeroStats — ровно те слагаемые, которыми герой идёт в бой.
import { Fragment } from "react";
import { cn } from "@/lib/utils";
import { useLang, useT } from "@/lib/i18n";
import { HERO_STAT_KEYS, STAT_LABELS, type HeroStats } from "@/lib/heroStats";

/** Дробей в статах не бывает, но округление дешевле, чем «12.000000001». */
const n = (v: number): number => Math.round(Number(v) || 0);

/** Колонок 4–7 (графы «Очки», «Ачивки», «Эффекты» — по наличию): Tailwind ждёт целые строки. */
const GRID: Record<number, string> = {
  4: "grid-cols-[1fr_auto_auto_auto]",
  5: "grid-cols-[1fr_auto_auto_auto_auto]",
  6: "grid-cols-[1fr_auto_auto_auto_auto_auto]",
  7: "grid-cols-[1fr_auto_auto_auto_auto_auto_auto]",
};

/** Прибавка со знаком: плюс своим цветом, минус красным, ноль — прочерк. */
function Delta({ v, up }: { v: number; up: string }) {
  return (
    <span
      className={cn(
        "text-right tabular-nums",
        v > 0 ? up : v < 0 ? "text-destructive" : "text-muted-foreground",
      )}
    >
      {v === 0 ? "—" : v > 0 ? `+${v}` : v}
    </span>
  );
}

export function HeroStatBreakdown({
  base,
  skill,
  gear,
  ach,
  effects,
  stats,
  trade,
  alchemy,
}: {
  base: HeroStats;
  /** Вложенные очки навыков повышенных уровней. Все нули или не передали
   * (старый кэш) — колонки нет, как у эффектов. */
  skill?: HeroStats | null;
  gear: HeroStats;
  /** Постоянные прибавки ачивок (§8.57). Все нули — колонки нет. */
  ach?: HeroStats | null;
  /** Временные эффекты: бусты плюсом, ослабления боссов минусом. Все нули или
   * не передали — колонки нет вовсе: пустой столбец прочерков только жмёт
   * таблицу на телефоне. */
  effects?: HeroStats | null;
  stats: HeroStats;
  /** Торговля — седьмой, НЕбоевой стат: в радар/бой не идёт, поэтому стоит
   * отдельной строкой под таблицей шести. undefined — строку не рисуем. */
  trade?: number | null;
  /** Алхимия — тоже НЕбоевой стат: растит сумку зелий. undefined — строки нет. */
  alchemy?: number | null;
}) {
  const t = useT();
  const lang = useLang();
  const hasEffects = !!effects && HERO_STAT_KEYS.some((k) => n(effects[k]) !== 0);
  const hasSkill = !!skill && HERO_STAT_KEYS.some((k) => n(skill[k]) !== 0);
  const hasAch = !!ach && HERO_STAT_KEYS.some((k) => n(ach[k]) !== 0);
  const head = "text-right text-muted-foreground";

  return (
    <div className="mt-2 rounded-xl border border-border bg-secondary/20 p-2">
      <div className="mb-1 text-[10px] font-bold text-muted-foreground">
        {t("braid.hero_stats_title")}
      </div>
      <div
        className={cn(
          "grid gap-x-2 gap-y-0.5 text-[10px]",
          GRID[4 + (hasSkill ? 1 : 0) + (hasAch ? 1 : 0) + (hasEffects ? 1 : 0)],
        )}
      >
        <span className="text-muted-foreground">{t("braid.hero_stats_stat")}</span>
        <span className={head}>{t("braid.hero_stats_base")}</span>
        {hasSkill && <span className={head}>{t("braid.hero_stats_skill")}</span>}
        <span className={head}>{t("braid.hero_stats_gear")}</span>
        {hasAch && <span className={head}>{t("ach.column")}</span>}
        {hasEffects && <span className={head}>{t("braid.hero_stats_effects")}</span>}
        <span className={head}>{t("braid.hero_stats_total")}</span>
        {HERO_STAT_KEYS.map((k) => (
          <Fragment key={k}>
            <span className="truncate">{STAT_LABELS[k][lang === "en" ? "en" : "ru"]}</span>
            <span className="text-right tabular-nums text-muted-foreground">{n(base[k])}</span>
            {/* Очки — постоянная прибавка, как артефакты: зелёным, не золотом эффектов. */}
            {hasSkill && <Delta v={n(skill![k])} up="text-success" />}
            <Delta v={n(gear[k])} up="text-success" />
            {hasAch && <Delta v={n(ach![k])} up="text-success" />}
            {/* Бусты золотом, ослабления боссов красным: цвет и есть ответ
                «мне помогли или меня прибили». */}
            {hasEffects && <Delta v={n(effects![k])} up="text-gold" />}
            <span className="text-right font-bold tabular-nums">{n(stats[k])}</span>
          </Fragment>
        ))}
      </div>
      {/* Торговля — вне сетки шести боевых статов: растит рюкзак, а не бой. */}
      {trade != null && (
        <div className="mt-1.5 flex items-center justify-between border-t border-border/60 pt-1.5 text-[10px]">
          <span className="text-muted-foreground">{t("braid.trade_stat")}</span>
          <span className="font-bold tabular-nums text-gold">{n(trade)}</span>
        </div>
      )}
      {alchemy != null && (
        <div className="mt-1 flex items-center justify-between text-[10px]">
          <span className="text-muted-foreground">{t("braid.alchemy_stat")}</span>
          <span className="font-bold tabular-nums text-gold">{n(alchemy)}</span>
        </div>
      )}
    </div>
  );
}
