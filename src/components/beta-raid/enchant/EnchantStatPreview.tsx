// Превью в инфо заклинания (владелец, 28.10.2026): во что превратятся статы
// выбранного артефакта при успехе — «Атака: 10 → 15», диапазон — «10 → 8…15».
// Минус — красным, плюс — зелёным.
import { Fragment } from "react";
import { useT } from "@/lib/i18n";
import { numText } from "@/components/beta-raid/market/num";
import { statPreview } from "@/components/beta-raid/enchant/enchantPlayerView";
import { useEnchantStatName } from "@/components/beta-raid/enchant/useEnchantStatName";

const TONE = { up: "ench-up", down: "ench-down" } as const;

export function EnchantStatPreview({
  stats,
  min,
  max,
}: {
  stats: Record<string, number>;
  min: number;
  max: number;
}) {
  const t = useT();
  const statName = useEnchantStatName();
  const rows = statPreview(stats, min, max);
  if (rows.length === 0) return null;

  return (
    <div className="ench-prev">
      <p className="ench-prev-h">{t("enchantshop.prev_head")}</p>
      {rows.map((r) => (
        <p key={r.key}>
          {statName(r.key)}: {numText(r.before)} →{" "}
          {r.after.map((a, i) => (
            <Fragment key={i}>
              {i > 0 && "…"}
              <span className={a.tone ? TONE[a.tone] : undefined}>{numText(a.n)}</span>
            </Fragment>
          ))}
        </p>
      ))}
    </div>
  );
}
