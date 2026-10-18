// Окно заброса (владелец, 06.10.2026): на сколько минут закидываем удочку.
//
// Ползунок упирается в то, что есть на самом деле: шестьдесят минут — потолок
// мира, а своя граница у каждого героя считается по удочкам (четыре целых и
// пятая наполовину — сорок пять). Больше ползунок не даст, поэтому «забросил на
// час, а удочки кончились через сорок минут» случиться не может.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";
import { useLang, useT } from "@/lib/i18n";
import { fishBonusText } from "@/lib/raid/fishBonus";
import { FISH_MINUTES_MAX } from "@/lib/raid/fishing";
import type { FishPlan } from "@/server/api/beta-raid/fishing/fishing-plan";

export function FishingCastCard({
  plan,
  loading,
  busy,
  onCast,
  onClose,
}: {
  plan: FishPlan | null;
  loading: boolean;
  busy: boolean;
  onCast: (minutes: number) => void;
  onClose: () => void;
}) {
  const t = useT();
  const max = Math.max(0, Math.min(FISH_MINUTES_MAX, plan?.maxMinutes ?? 0));
  const [minutes, setMinutes] = useState(max);
  const lang = useLang() === "en" ? "en" : "ru";
  const bonus = fishBonusText(plan?.bonusPct ?? 0, lang);
  // Удочки пересчитались (сломалась, купили новую) — ползунок едет за ними.
  useEffect(() => setMinutes(max), [max]);

  return createPortal(
    <div
      className="fixed inset-0 z-[130] flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="raid-fishing-dialog w-full max-w-sm rounded-t-3xl border border-border bg-background p-4 pb-[calc(env(safe-area-inset-bottom)+84px)] sm:rounded-3xl sm:pb-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="flex min-w-0 items-center gap-1.5 truncate font-display text-lg font-bold">
            <img
              src="/resources/raid-hud-art-fish.png"
              alt=""
              className="raid-fishing-dialog__fish"
            />
            {t("fish.cast_title")}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading && !plan ? (
          <div className="grid place-items-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <span className="font-display text-3xl font-bold tabular-nums text-gold">
                {t("fish.minutes", { n: minutes })}
              </span>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {t("fish.tries_left", { n: plan?.rodTries ?? 0 })}
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={Math.max(1, max)}
              step={1}
              value={minutes}
              disabled={max <= 0}
              onChange={(e) => setMinutes(Number(e.target.value))}
              className="w-full accent-[var(--gold)]"
            />
            <div className="mb-3 flex justify-between text-[11px] tabular-nums text-muted-foreground">
              <span>1</span>
              <span>{Math.max(1, max)}</span>
            </div>

            {/* Бонус к рыбалке от артефактов и удачи — в процентах к базе. Базу
                игрок не видит, только прибавку; нет бонуса — строки нет. */}
            {bonus && (
              <div className="mb-3 flex items-center justify-between rounded-xl border border-gold/40 bg-gold/10 px-3 py-2 text-sm">
                <span className="text-muted-foreground">{t("fish.bonus")}</span>
                <b className="tabular-nums text-gold">{bonus}</b>
              </div>
            )}

            <button
              type="button"
              disabled={busy || max <= 0}
              onClick={() => onCast(Math.max(1, Math.min(max, minutes)))}
              className="raid-fishing-dialog__cast flex w-full items-center justify-center gap-1.5 rounded-2xl gradient-gold px-4 py-3 text-gold-foreground disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <img src="/resources/raid-hud-art-fish.png" alt="" />
              )}
              {t("fish.cast_for", { n: Math.max(1, Math.min(max, minutes)) })}
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
