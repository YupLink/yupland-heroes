// Показ приза из мистического бокса. Вынесен из MysticBoxesSection (файл
// упирался в 250 строк).
//
// Кроме анимации здесь есть главное для игрока: КУДА положили приз.
// В замке герой и артефакт ведут к соответствующему разделу Таверны.
import { type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { ArrowRight } from "lucide-react";
import { useLang, useT } from "@/lib/i18n";
import type { MysticRewardDestination } from "@/lib/mysticRewardDestination";
import { gotoChipsSub, type ChipsSubTab } from "@/lib/chipsNav";
import type { MysticPrize } from "@/server/api/mystic";
import { MB_REVEAL_CSS, mysticPrizeView, whereText } from "./mysticPrizeView";

import { thumb } from "@/lib/image";
export function MysticPrizeReveal({
  prize,
  onClose,
  onViewMysticReward,
}: {
  prize: MysticPrize;
  onClose: () => void;
  onViewMysticReward?: (kind: MysticRewardDestination) => void;
}) {
  const t = useT();
  const ru = useLang() === "ru";
  const tavernReward = prize.kind === "hero" || prize.kind === "artifact" ? prize.kind : null;
  const { label, Icon, color, image, rar, where } = mysticPrizeView(prize, t);
  const m = { label, color };
  const isBlank = prize.kind === "blank";
  // Искры-частицы (детерминированные позиции, без Math.random-мерцания).
  const sparks = Array.from({ length: 10 }, (_, i) => (i / 10) * Math.PI * 2);

  return createPortal(
    <div
      className="mb-reveal-root fixed inset-0 z-[170] flex items-center justify-center bg-black/75 p-4"
      onClick={onClose}
    >
      <style>{MB_REVEAL_CSS}</style>
      <div
        className="mb-card w-full max-w-xs overflow-hidden rounded-3xl border bg-card p-6 text-center"
        style={{ borderColor: m.color + "77" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative mx-auto mb-4 h-28 w-28">
          {!isBlank && (
            <div
              className="mb-ring absolute inset-[-10px] rounded-full"
              style={{
                background: `conic-gradient(from 0deg, transparent, ${m.color}88, transparent 60%)`,
              }}
            />
          )}
          <div
            className="mb-glow absolute inset-0 rounded-2xl"
            style={{ boxShadow: `0 0 48px ${m.color}66`, background: m.color + "1f" }}
          />
          {!isBlank &&
            sparks.map((a, i) => (
              <span
                key={i}
                className="mb-spark"
                style={
                  {
                    background: m.color,
                    "--dx": `${Math.cos(a) * 70}px`,
                    "--dy": `${Math.sin(a) * 70}px`,
                    animationDelay: `${(i % 5) * 40}ms`,
                  } as CSSProperties
                }
              />
            ))}
          <div className="absolute inset-0 grid place-items-center">
            {image ? (
              <img src={thumb(image, 192)} alt="" className="h-24 w-24 rounded-2xl object-cover" />
            ) : (
              <Icon className="h-14 w-14" style={{ color: m.color }} />
            )}
          </div>
        </div>
        <div className="mb-label">
          <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            {isBlank ? "" : t("chips.mystic_dropped")}
          </div>
          <div className="mt-1 text-xl font-bold" style={{ color: m.color }}>
            {m.label}
          </div>
          {rar && (
            <span
              className="mt-1.5 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wide"
              style={{ background: rar.color + "22", color: rar.color }}
            >
              {rar.label}
            </span>
          )}
          {where && (
            <div className="mt-2 text-[11px] leading-snug text-muted-foreground">
              {whereText(prize, t, ru, !!onViewMysticReward)}
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          className="mt-5 w-full rounded-full bg-gold py-2.5 text-sm font-bold text-background transition active:scale-95"
        >
          {t("chips.mystic_take")}
        </button>
        {tavernReward && onViewMysticReward ? (
          <button
            type="button"
            onClick={() => {
              onClose();
              onViewMysticReward(tavernReward);
            }}
            className="mt-2 inline-flex w-full items-center justify-center gap-1 rounded-full border border-border/60 py-2 text-xs font-medium text-muted-foreground transition hover:text-foreground active:scale-95"
          >
            {ru ? "Посмотреть в Таверне" : "View in Tavern"}
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        ) : where?.go && where.cta ? (
          <button
            onClick={() => {
              onClose();
              gotoChipsSub(where.go as ChipsSubTab);
            }}
            className="mt-2 inline-flex w-full items-center justify-center gap-1 rounded-full border border-border/60 py-2 text-xs font-medium text-muted-foreground transition hover:text-foreground active:scale-95"
          >
            {t(where.cta)}
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
