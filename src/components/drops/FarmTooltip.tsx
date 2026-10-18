import { useState } from "react";
import { useT } from "@/lib/i18n";

export function FarmTooltip({
  isSubscribed,
  capHours,
  baseHours,
}: {
  isSubscribed: boolean;
  capHours: number;
  baseHours: number;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-block self-center">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="flex h-5 w-5 items-center justify-center rounded-full border border-border bg-secondary/40 text-[11px] font-bold text-muted-foreground transition hover:border-gold/40 hover:text-foreground"
        aria-label={t("mynfts.how_it_works_aria")}
      >
        ?
      </button>
      {open && (
        <div className="absolute right-0 top-7 z-20 w-[min(16rem,calc(100vw-2rem))] max-w-[calc(100vw-1rem)] rounded-lg border border-border bg-card p-3 text-[11px] leading-relaxed shadow-2xl">
          <div className="font-medium text-foreground">
            {t("mynfts.farm_tooltip_title")}
          </div>
          <ul className="mt-1.5 space-y-1 text-muted-foreground">
            <li>
              • {t("mynfts.farm_tip_reward", { h: baseHours })}
            </li>
            <li>
              • {t("mynfts.farm_tip_multi")}
            </li>
            <li>
              • {t("mynfts.farm_tip_claim")}
            </li>
            <li>
              •{" "}
              {isSubscribed
                ? t("mynfts.farm_tip_sub_on", { h: capHours })
                : t("mynfts.farm_tip_sub_off", {
                    base: baseHours,
                    doubled: baseHours * 2,
                  })}
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
