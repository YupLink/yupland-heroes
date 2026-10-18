// Плитка героя в окне поля: портрет, имя, уровень и чем он занят.
//
// Уровень виден всегда, а у занятого — ещё и где он батрачит (владелец,
// 09.10.2026): раньше вместо уровня стояло голое «занят», и два одинаковых
// героя разного уровня было не отличить, а куда ушёл герой — не понять.
import { cn } from "@/lib/utils";
import { thumb } from "@/lib/image";
import { useT } from "@/lib/i18n";
import { HeroRestBadge } from "@/components/heroes/HeroRestBadge";
import { RESTING_CLASS, heroRestView } from "@/components/heroes/heroRestView";
import type { FieldHero } from "@/server/api/beta-raid/field-heroes";

const RARITY_COLOR: Record<string, string> = {
  rare: "#5b9bff",
  epic: "#b46bff",
  legendary: "#f5c451",
};

export function FieldHeroTile({
  hero: h,
  here,
  now,
  chosen,
  onPick,
}: {
  hero: FieldHero;
  /** «q,r» этого поля. */
  here: string;
  now: number;
  chosen: boolean;
  onPick: () => void;
}) {
  const t = useT();
  const busyHere = h.busyAt === here;
  const busy = !!h.busyAt && !busyHere;
  const rest = heroRestView(h.restUntil, now, t);
  // Основной не батрачит — он основной (владелец 29.09).
  const main = !!h.main && !busyHere;
  const status = rest.resting
    ? rest.label
    : main
      ? t("braid.field_hero_main")
      : busy
        ? t("braid.field_busy_at", { at: h.busyAt ?? "" })
        : busyHere
          ? t("braid.field_here")
          : null;
  return (
    <button
      type="button"
      disabled={busy || rest.resting || main}
      onClick={onPick}
      className={cn(
        "flex flex-col items-center gap-1 rounded-xl border p-2 text-[10px] transition disabled:opacity-40",
        chosen
          ? "border-gold bg-gold/10"
          : busyHere
            ? "border-gold/50"
            : "border-border hover:border-gold/40",
        rest.resting && RESTING_CLASS,
      )}
    >
      <div
        className="relative h-12 w-12 overflow-hidden rounded-lg bg-secondary/40"
        style={{ boxShadow: `0 0 0 2px ${RARITY_COLOR[h.rarity] ?? "#9aa4bd"}` }}
      >
        {h.imageUrl && (
          <img src={thumb(h.imageUrl, 96, "black")} alt="" className="h-full w-full object-cover" />
        )}
        {rest.resting && <HeroRestBadge />}
      </div>
      <span className="w-full truncate text-center">{h.name}</span>
      <span className="text-muted-foreground">{t("braid.field_lvl", { n: h.level })}</span>
      {status && (
        <span className="w-full truncate text-center text-muted-foreground">{status}</span>
      )}
    </button>
  );
}
