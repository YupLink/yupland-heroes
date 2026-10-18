// Окно рыбалки (ПРАВИЛА §8.35): удочка в руках (картинка, прочность, штуки),
// улов за эту рыбалку, сколько до следующей поимки — и «Хватит». Подписей-
// пояснений нет: названия полей и значения. Раскладка — как у окна цели
// (BetaEncounterModal): снизу на телефоне с запасом под нижнюю навигацию, по
// центру на десктопе, своя прокрутка.
import { createPortal } from "react-dom";
import { Fish, Loader2, Square, X } from "lucide-react";
import { useT } from "@/lib/i18n";
import { thumb } from "@/lib/image";
import { formatQty } from "@/lib/formatQty";
import { shownDurability } from "@/lib/raid/mainTool";
import { leftClock } from "@/lib/raid/fishing";
import type { BackpackStack } from "@/server/api/beta-raid/market-backpack";

export function FishingCard({
  rod,
  caught,
  tries,
  plan,
  leftMs,
  busy,
  onStop,
  onClose,
}: {
  /** Удочка в руках (рюкзак); нет — строки удочки нет. */
  rod: BackpackStack | null;
  caught: number;
  /** Сколько попыток отыграно из заказанных: «7 / 45». */
  tries?: number;
  plan?: number;
  /** До следующей поимки, мс. */
  leftMs: number | null;
  busy: boolean;
  onStop: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const d = rod?.durability == null ? null : shownDurability(rod.durability);
  return createPortal(
    <div
      className="fixed inset-0 z-[130] flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[88dvh] w-full max-w-sm overflow-y-auto overscroll-contain rounded-t-3xl border border-border bg-background p-4 pb-[calc(env(safe-area-inset-bottom)+84px)] sm:max-h-[92vh] sm:rounded-3xl sm:pb-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="flex min-w-0 items-center gap-1.5 truncate font-display text-lg font-bold">
            <Fish className="h-5 w-5 shrink-0 text-gold" />
            <span className="truncate">{t("fish.title")}</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-secondary/40 text-muted-foreground transition hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {rod && (
          <div className="mb-2 flex items-center gap-3 rounded-2xl border border-border bg-secondary/20 p-2">
            <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-secondary/40">
              {rod.image ? (
                <img
                  src={thumb(rod.image, 96, "black")}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <Fish className="h-5 w-5 text-gold" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{rod.name}</div>
              <div className="flex items-center gap-2 text-xs font-semibold tabular-nums">
                {d !== null && (
                  <span
                    aria-label={t("braid.tool_durability", { n: d })}
                    className={d <= 25 ? "text-destructive" : "text-gold"}
                  >
                    {d}%
                  </span>
                )}
                <span className="text-muted-foreground">×{formatQty(rod.count)}</span>
              </div>
            </div>
          </div>
        )}
        {/* Заброс на несколько минут: сколько попыток уже отыграно. У заброса
            на одну попытку строки нет — там и считать нечего. */}
        {(plan ?? 0) > 1 && (
          <div className="mb-2 rounded-2xl border border-border px-3 py-2 text-sm">
            <div className="text-[11px] text-muted-foreground">{t("fish.progress")}</div>
            <div className="font-display text-lg font-bold tabular-nums">
              {tries ?? 0} / {plan}
            </div>
          </div>
        )}
        <div className="mb-3 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-2xl border border-border px-3 py-2">
            <div className="text-[11px] text-muted-foreground">{t("fish.caught")}</div>
            <div className="font-display text-lg font-bold tabular-nums">{caught}</div>
          </div>
          <div className="rounded-2xl border border-border px-3 py-2">
            <div className="text-[11px] text-muted-foreground">{t("fish.next")}</div>
            <div className="font-display text-lg font-bold tabular-nums">
              {leftMs === null ? "—" : leftClock(leftMs)}
            </div>
          </div>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={onStop}
          className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-border px-4 py-3 text-sm font-semibold disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
          {t("fish.stop")}
        </button>
      </div>
    </div>,
    document.body,
  );
}
