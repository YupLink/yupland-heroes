// Итог пачки Bonus Box (до 50 за раз): одно окно со списком выпавшего.
// Энергия, золото, ресурсы, токены, товары рюкзака — одной строкой с общей
// суммой; одинаковые артефакты, герои, паки и пустые — одна карточка «×n» в
// уголке (groupMysticPrizes). Вид приза и подсказка «куда положили» — те же,
// что у окна одного приза (mysticPrizeView).
import { createPortal } from "react-dom";
import { useLang, useT } from "@/lib/i18n";
import type { MysticRewardDestination } from "@/lib/mysticRewardDestination";
import { groupMysticPrizes } from "@/lib/mysticBatch";
import type { MysticPrize } from "@/server/api/mystic";
import { MB_REVEAL_CSS, mysticPrizeView, whereText } from "./mysticPrizeView";

import { thumb } from "@/lib/image";
export function MysticBatchReveal({
  title,
  prizes,
  onClose,
  onViewMysticReward,
}: {
  title: string;
  prizes: MysticPrize[];
  onClose: () => void;
  onViewMysticReward?: (kind: MysticRewardDestination) => void;
}) {
  const t = useT();
  const ru = useLang() === "ru";
  // В замке герой/артефакт лежат в Таверне — подсказка как у одиночного окна.
  const inCastle = !!onViewMysticReward;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="mb-reveal-root fixed inset-0 z-[170] flex items-center justify-center bg-black/75 p-4"
      onClick={onClose}
    >
      <style>{MB_REVEAL_CSS}</style>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mb-batch-title"
        className="mb-card flex max-h-[calc(100dvh-2rem)] w-full max-w-sm flex-col overflow-hidden rounded-3xl border border-gold/40 bg-card p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 text-center">
          <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            {t("chips.mystic_dropped")}
          </div>
          <div id="mb-batch-title" className="mt-1 truncate text-lg font-bold text-gold">
            {title}
          </div>
        </div>
        <ul className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain">
          {groupMysticPrizes(prizes).map(({ prize, times, summed }, i) => {
            const v = mysticPrizeView(prize, t);
            const hint = whereText(prize, t, ru, inCastle);
            return (
              <li
                key={i}
                className="mb-label flex items-center gap-3 rounded-2xl border bg-secondary/30 p-2"
                style={{
                  borderColor: v.color + "44",
                  animationDelay: `${150 + Math.min(i, 10) * 40}ms`,
                }}
              >
                <div className="relative h-11 w-11 shrink-0">
                  <div
                    className="grid h-full w-full place-items-center overflow-hidden rounded-xl"
                    style={{ background: v.color + "1f" }}
                  >
                    {v.image ? (
                      <img src={thumb(v.image, 192)} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <v.Icon className="h-6 w-6" style={{ color: v.color }} />
                    )}
                  </div>
                  {!summed && times > 1 && (
                    <span className="absolute -right-1.5 -top-1.5 rounded-full border border-gold/50 bg-black/85 px-1 py-0.5 text-[10px] leading-none font-bold text-gold">
                      ×{times}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1 text-left">
                  <div className="truncate text-sm font-bold" style={{ color: v.color }}>
                    {v.label}
                  </div>
                  {(v.rar || hint) && (
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] leading-snug text-muted-foreground">
                      {v.rar && (
                        <span
                          className="rounded-full px-1.5 py-px text-[10px] font-extrabold uppercase tracking-wide"
                          style={{ background: v.rar.color + "22", color: v.rar.color }}
                        >
                          {v.rar.label}
                        </span>
                      )}
                      {hint && <span>{hint}</span>}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        <button
          onClick={onClose}
          className="mt-4 w-full shrink-0 rounded-full bg-gold py-2.5 text-sm font-bold text-background transition active:scale-95"
        >
          {t("chips.mystic_take")}
        </button>
      </div>
    </div>,
    document.body,
  );
}
