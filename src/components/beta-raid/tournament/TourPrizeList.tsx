// Призы по местам — вкладка «Призы» раскрытой плашки: слева место — «1» или
// «2–3», справа всё, что на это место дают.
//
// Конкретный предмет (артефакт — например, корона за 1 место, герой, товар
// из справочника) показан крупнее и открывается тапом: карточка с его
// параметрами — та же, что «i» в маркете (владелец, 05.10.2026).
import { useState } from "react";
import { Info } from "lucide-react";
import { useLang, useT } from "@/lib/i18n";
import type { TourBand, TourPrize } from "@/lib/tournament/types";
import { ItemInfoModal } from "../market/ItemInfoModal";
import { bandsByPlace, placesText, prizeText } from "./tourView";

import { thumb } from "@/lib/image";
const ITEM_KINDS = new Set<TourPrize["kind"]>(["art", "hero", "item"]);

/** id шаблона, если приз — конкретный предмет; «артефакт редкости» — нет. */
export function prizeItemId(p: TourPrize): string | null {
  const ref = (p.refId ?? "").trim();
  if (!ITEM_KINDS.has(p.kind) || !ref || ref.startsWith("rarity:")) return null;
  return ref;
}

export function TourPrizeList({ bands }: { bands: readonly TourBand[] }) {
  const t = useT();
  const lang = useLang();
  const [infoId, setInfoId] = useState<string | null>(null);
  if (bands.length === 0) {
    return <p className="px-1 text-[11px] text-muted-foreground">{t("tour.no_prizes")}</p>;
  }
  return (
    <>
      <ul className="space-y-1.5 px-1">
        {bandsByPlace(bands).map((b, i) => (
          <li key={`${b.places}-${i}`} className="flex items-start gap-2">
            <span className="w-12 shrink-0 pt-0.5 font-display text-xs font-bold tabular-nums text-gold">
              {placesText(b.places)}
            </span>
            <span className="flex min-w-0 flex-1 flex-wrap gap-1">
              {b.prizes.map((p, j) => {
                const id = prizeItemId(p);
                const text = prizeText(p, t, lang);
                if (id) {
                  return (
                    <button
                      key={j}
                      type="button"
                      onClick={() => setInfoId(id)}
                      className="inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-lg border border-gold/40 bg-gold/10 py-0.5 pl-0.5 pr-1.5 text-[11px] font-semibold text-gold"
                    >
                      {p.image && (
                        <img
                          src={thumb(p.image, 64)}
                          alt=""
                          className="h-8 w-8 shrink-0 rounded-md object-cover"
                        />
                      )}
                      <span className="truncate">{text}</span>
                      <Info className="h-3.5 w-3.5 shrink-0 opacity-70" />
                    </button>
                  );
                }
                return (
                  <span
                    key={j}
                    className="inline-flex max-w-full items-center gap-1 rounded-md bg-secondary/50 px-1.5 py-0.5 text-[11px]"
                  >
                    {p.image && (
                      <img src={thumb(p.image, 64)} alt="" className="h-4 w-4 shrink-0 rounded object-cover" />
                    )}
                    <span className="truncate">{text}</span>
                  </span>
                );
              })}
            </span>
          </li>
        ))}
      </ul>
      {infoId && <ItemInfoModal id={infoId} layer="z-[130]" onClose={() => setInfoId(null)} />}
    </>
  );
}
