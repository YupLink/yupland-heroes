// Плитка героя в списке выбора: портрет, раса-специализация, редкость, уровень.
//
// Вынесена из HeroPickerModal ради лимита в 250 строк. Батрачащий герой
// показан приглушённым и с подписью «батрачит»: основным его не поставить,
// пока он на грядке, и узнавать об этом из отказа сервера — обидно.
// Отдыхающий (снят с грядки издалека) — серый, с луной и временем отдыха, и
// не нажимается вовсе.
import { Check, Sprout } from "lucide-react";
import { cn } from "@/lib/utils";
import { thumb } from "@/lib/image";
import { useLang, useT } from "@/lib/i18n";
import { metaLabel } from "@/components/heroMeta";
import { RARITY_COLOR } from "@/components/heroes/heroLabels";
import { HeroRestBadge } from "@/components/heroes/HeroRestBadge";
import { RESTING_CLASS, heroRestView } from "@/components/heroes/heroRestView";

export type PickerHero = {
  id: string | null;
  itemId?: string | null;
  templateId: string;
  imageUrl: string | null;
  race: string | null;
  specialization: string | null;
  rarity: string;
  level: number;
  maxLevel: number;
  busyField?: string | null;
  /** До какого момента отдыхает (ISO). */
  restUntil?: string | null;
};

export function HeroPickerCard({
  hero,
  chosen,
  framed = chosen,
  onPick,
  now = 0,
}: {
  hero: PickerHero;
  /** Основной сейчас — галочка. */
  chosen: boolean;
  /** Рамка: тапнутый, ждущий подтверждения, иначе основной. */
  framed?: boolean;
  onPick: () => void;
  /** Тик экрана (useNowTick) — по нему гаснет и оживает отдыхающий. */
  now?: number;
}) {
  const t = useT();
  const lang = useLang();
  const color = RARITY_COLOR[hero.rarity] ?? "#9aa4bd";
  const rest = heroRestView(hero.restUntil, now, t);
  return (
    <button
      onClick={onPick}
      disabled={rest.resting}
      className={cn(
        "flex flex-col items-center gap-1 rounded-xl border p-2 transition",
        framed ? "border-gold bg-gold/10" : "border-border hover:border-gold/40",
        hero.busyField && "opacity-60",
        rest.resting && RESTING_CLASS,
      )}
    >
      <div
        className="relative h-14 w-14 overflow-hidden rounded-lg bg-secondary/40"
        style={{ boxShadow: `0 0 0 2px ${color}` }}
      >
        {hero.imageUrl && (
          <img
            src={thumb(hero.imageUrl, 120, "black")}
            alt=""
            className="h-full w-full object-cover"
          />
        )}
        {chosen && (
          <span className="absolute bottom-0 right-0 grid h-5 w-5 place-items-center rounded-tl-lg bg-gold text-gold-foreground">
            <Check className="h-3 w-3" />
          </span>
        )}
        {hero.busyField && (
          <span className="absolute left-0 top-0 grid h-5 w-5 place-items-center rounded-br-lg bg-emerald-500 text-black">
            <Sprout className="h-3 w-3" />
          </span>
        )}
        {rest.resting && <HeroRestBadge />}
      </div>
      {/* Раса и специализация вместо имени — по ним и выбирают. */}
      <span className="w-full truncate text-center text-[10px] leading-tight">
        {[hero.race, hero.specialization]
          .filter(Boolean)
          .map((v) => metaLabel(v as string, lang))
          .join(" · ") || "—"}
      </span>
      <span
        className="rounded-full px-1.5 py-0.5 text-[9px] font-bold"
        style={{ background: color + "22", color }}
      >
        {metaLabel(hero.rarity, lang) || hero.rarity}
      </span>
      <span className="text-[9px] text-muted-foreground">
        {rest.resting
          ? rest.label
          : hero.busyField
            ? t("braid.hero_at_field")
            : t("braid.hero_lvl_short", { n: hero.level, max: hero.maxLevel })}
      </span>
    </button>
  );
}
