// Выбор артефакта поверх окна постройки: все артефакты аккаунта (и надетые),
// сетка ~4 в ряд под ширину, своя прокрутка. Зачарованные — ✦ и не выбираются.
// Выбрал — снизу «Подтвердить».
//
// Оболочка — как у выбора артефакта в маркете (MarketArtPick): порталом в body
// и z-140, иначе окно постройки под backdrop-blur обрезало бы попап. Три
// состояния не сливаются: «грузим», «не смогли» (с повтором) и «пусто».
import { useState } from "react";
import { createPortal } from "react-dom";
import { Check, Loader2, RotateCw, X } from "lucide-react";
import { useT } from "@/lib/i18n";
import type { EnchantArtifactView } from "@/lib/enchant/enchant";
import { useEnchantArts } from "@/components/beta-raid/enchant/enchantQueries";
import { pickable } from "@/components/beta-raid/enchant/enchantView";
import { EnchantArtCell } from "@/components/beta-raid/enchant/EnchantArtCell";

export function EnchantArtPicker({
  value,
  onPick,
  onClose,
}: {
  /** itemId выбранного сейчас артефакта. */
  value: string | null;
  onPick: (a: EnchantArtifactView) => void;
  onClose: () => void;
}) {
  const t = useT();
  const arts = useEnchantArts(true);
  const [sel, setSel] = useState<string | null>(value);
  const list = arts.data ?? [];
  const chosen = list.find((a) => a.itemId === sel && pickable(a)) ?? null;

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="ench-pick fixed inset-0 z-[140] flex items-end justify-center bg-black/75 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("enchantshop.arts")}
        className="flex max-h-[85dvh] w-full max-w-sm flex-col overflow-hidden rounded-t-2xl border border-border bg-background sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <h4 className="font-display text-sm font-bold">{t("enchantshop.arts")}</h4>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="grid h-8 w-8 place-items-center rounded-full border border-border text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
          {arts.isLoading ? (
            <div className="flex justify-center py-8 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : arts.isError ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="text-sm text-muted-foreground">{t("enchantshop.arts_error")}</p>
              <button
                type="button"
                onClick={() => void arts.refetch()}
                disabled={arts.isFetching}
                className="flex items-center gap-1.5 rounded-xl border border-gold/60 px-4 py-2 text-sm font-bold text-gold disabled:opacity-50"
              >
                <RotateCw className="h-4 w-4" />
                {t("enchantshop.retry")}
              </button>
            </div>
          ) : list.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("enchantshop.arts_none")}
            </p>
          ) : (
            <div className="ench-pick-grid">
              {list.map((a) => (
                <EnchantArtCell
                  key={a.itemId}
                  a={a}
                  pressed={a.itemId === sel}
                  locked={!pickable(a)}
                  onClick={() => setSel(a.itemId)}
                />
              ))}
            </div>
          )}
        </div>

        {chosen && (
          <div className="shrink-0 border-t border-border p-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
            <button
              type="button"
              onClick={() => {
                onPick(chosen);
                onClose();
              }}
              className="ench-go"
            >
              <Check className="h-4 w-4" />
              {t("enchantshop.confirm")}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
