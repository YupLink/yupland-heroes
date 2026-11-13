// Итог попытки: успех ±N% со статами «было → стало» (минус — красным), «Не вышло»
// или «Разрушен — исчез навсегда».
import { useT } from "@/lib/i18n";
import { useEnchantStatName } from "@/components/beta-raid/enchant/useEnchantStatName";
import { numText } from "@/components/beta-raid/market/num";
import { enchantPctText } from "@/lib/enchant/enchant";

export type EnchantOutcome = {
  outcome: "ok" | "none" | "gone";
  pct?: number;
  before?: Record<string, number>;
  after?: Record<string, number>;
};

export function EnchantResult({ res, artName }: { res: EnchantOutcome; artName: string }) {
  const t = useT();
  const statName = useEnchantStatName();

  if (res.outcome === "ok") {
    const before = res.before ?? {};
    const after = res.after ?? {};
    const pct = res.pct ?? 0;
    return (
      <div className={`ench-result ${pct < 0 ? "is-bad" : "is-ok"}`} role="status">
        <h5>{t("enchantshop.res_ok", { pct: enchantPctText(pct) })}</h5>
        <p>
          {Object.keys(after).map((k, i) => (
            <span key={k}>
              {i > 0 && " · "}
              {statName(k)} {numText(before[k] ?? 0)} →{" "}
              <span className={pct < 0 ? "ench-down" : "ench-up"}>{numText(after[k])}</span>
            </span>
          ))}
        </p>
      </div>
    );
  }

  if (res.outcome === "gone") {
    return (
      <div className="ench-result is-bad" role="status">
        <h5>{t("enchantshop.res_gone")}</h5>
        <p>{artName}</p>
      </div>
    );
  }

  return (
    <div className="ench-result" role="status">
      <h5>{t("enchantshop.res_none")}</h5>
      <p>{t("enchantshop.res_none_sub")}</p>
    </div>
  );
}
