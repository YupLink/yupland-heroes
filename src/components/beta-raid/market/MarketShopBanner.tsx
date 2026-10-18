// Баннер ограничений магазина — над сеткой товаров, а не внутри неё (иначе он
// отжимал первую плитку и читался как товар). Формулировку выбираем по тому,
// ЧТО именно ограничил админ: только раса — «для расы …», только специализация
// — «для специализации …», оба — через «·». Не «для героя»: герой один, а
// ограничения свои.
import { useLang, useT } from "@/lib/i18n";
import { metaLabel } from "@/components/heroMeta";

export function MarketShopBanner({
  races,
  specs,
  heroFits,
}: {
  races: string[];
  specs: string[];
  heroFits?: boolean;
}) {
  const lang = useLang();
  const t = useT();
  if (races.length === 0 && specs.length === 0) return null;
  const raceStr = races.map((r) => metaLabel(r, lang)).join(" / ");
  const specStr = specs.map((s) => metaLabel(s, lang)).join(" / ");
  const parts: string[] = [];
  if (raceStr) parts.push(t("market.shop_by_race", { race: raceStr }));
  if (specStr) parts.push(t("market.shop_by_spec", { spec: specStr }));
  const who = parts.join(" · ");
  return (
    <div
      className={
        heroFits
          ? "mb-2 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-center text-xs font-semibold text-emerald-300"
          : "mb-2 rounded-2xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-center text-xs font-semibold text-destructive"
      }
    >
      {t(heroFits ? "market.shop_fits" : "market.shop_locked", { who })}
    </div>
  );
}
