// Живые цифры товара ратуши по черновику пульта: склад против нормы, цена прямо
// сейчас, НЗ, на сколько дней хватит и во сколько золота городу
// обходится суточная еда по цене ×1 — опора для баланса: примерно столько
// золота город раздаёт игрокам в сутки, когда запас держится у нормы.
import { dailyNeed, type TownGood } from "@/lib/townConfig";
import type { TownRules } from "@/lib/townRules";
import { isRush, quoteBuy, quoteSell, RUSH_X, townCurve } from "@/lib/townPricing";

const f = (n: number) => (Math.round(n * 100) / 100).toLocaleString("ru-RU");

export function TownGoodLive({
  good,
  residents,
  rules,
  stock,
  area,
  lowSince = null,
}: {
  good: TownGood;
  residents: number;
  rules: TownRules;
  /** Склад сейчас; нет — товар новый, стартует ровно с нормы. */
  stock: number | undefined;
  /** Добыча с окрестности в сутки (радиус 10, townYield) — к производству пульта. */
  area?: number;
  /** С какого момента запас на НЗ и ниже: сутки и больше — особый спрос, скупка ×4. */
  lowSince?: string | null;
}) {
  const base = townCurve(good, residents, rules);
  const s = stock ?? base.norm;
  const rush = isRush(base, s, lowSince, Date.now());
  const c = rush ? { ...base, lowX: RUSH_X } : base;
  const buy = quoteBuy(c, s, 1);
  const sell = quoteSell(c, s, 1);
  const need = dailyNeed(good, residents);
  const b = (v: string) => <b className="text-foreground">{v}</b>;
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5 rounded-lg bg-secondary/40 px-2 py-1 text-[10px] text-muted-foreground">
      <span>
        склад {b(f(s))} из нормы {b(f(c.norm))}
      </span>
      <span>продаёт за {b(buy.ok ? f(buy.total) : "—")}</span>
      <span>берёт за {b(sell.ok ? f(sell.total) : "—")}</span>
      {rush && <span className="font-bold text-orange-400">особый спрос ×2</span>}
      <span>НЗ {b(f(c.reserve))}</span>
      {area != null && area > 0 && <span>окрестность +{b(f(area))} в сутки</span>}
      {need > 0 && (
        <span>
          хватит на {b(f(s / need))} дн. · еда на {b(f(need * c.base))} зол./сутки
        </span>
      )}
    </div>
  );
}
