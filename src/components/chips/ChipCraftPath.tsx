// Путь прокачки фишки до 5★ в карточке игрока (ChipDetailModal): шаги и цена
// каждого в золоте по текущему курсу (mult — множитель с сервера, null — пока
// неизвестен). Итог «до 5★» считается по тем же ценам шагов.
import { useLang, useT } from "@/lib/i18n";
import { labelForLevel } from "@/components/chips/levelLabel";
import { ResourceGlyph } from "@/components/ui/ResourceGlyph";
import { CRAFT_PATH, CRAFT_TOTALS, craftPathFrom } from "@/lib/craftPath";
import { craftGoldTotal, fmtGold, goldAtMultiplier } from "@/lib/craftGold";

export function ChipCraftPath({ level, mult }: { level: number; mult: number | null }) {
  const t = useT();
  const ru = useLang() === "ru";
  const gold = (std: number) => (mult == null ? "…" : fmtGold(goldAtMultiplier(std, mult), ru));
  return (
    <details className="rounded-xl border border-border/60 bg-secondary/20 p-2.5 text-[11px]">
      <summary className="cursor-pointer font-semibold text-gold">
        {t("chips.upgrade_path_title")}
      </summary>
      <div className="mt-2 space-y-1">
        {craftPathFrom(level).map((s) => (
          <div key={s.from} className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">
              {labelForLevel(s.from)} → {labelForLevel(s.to)}
            </span>
            <span className="inline-flex items-center gap-1 text-right">
              {`+${s.chips - 1}× ${labelForLevel(s.sacrificeLevel ?? s.from)} `}
              {s.identical ? t("chips.same_kind") : t("chips.any_kind")} · +{gold(s.cost)}
              <ResourceGlyph kind="gold" className="h-3 w-3" />
            </span>
          </div>
        ))}
        <div className="mt-1.5 border-t border-border/50 pt-1.5 text-muted-foreground">
          {t("chips.to_5_star", {
            n: CRAFT_TOTALS["5"].lvl1,
            c: mult == null ? "…" : fmtGold(craftGoldTotal(CRAFT_PATH, mult), ru),
          })}
        </div>
      </div>
    </details>
  );
}
