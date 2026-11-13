// Спрашиваем перед открытием пака: содержимое разыгрывается ИМЕННО в момент
// открытия, отменить или «закрыть обратно» нельзя. Раньше пак открывался с
// одного тапа — случайное касание сжигало пак безвозвратно.
//
// Один диалог на пачку, а не на каждый пак: count приходит уже посчитанным
// («Открыть» = 1, «Все ×N» = N), поэтому массовое открытие спрашивает один раз.
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Loader2, Sparkles, Box, X } from "lucide-react";
import { useT } from "@/lib/i18n";

import { thumb } from "@/lib/image";
export function OpenPackConfirmModal({
  packName,
  imageUrl,
  count,
  pending,
  onCancel,
  onConfirm,
}: {
  packName: string;
  imageUrl?: string | null;
  count: number;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useT();

  // Esc = отмена. Пока запрос в полёте — не даём закрыть, чтобы не остаться
  // с непонятным «нажал или нет».
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending, onCancel]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[160] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={() => {
        if (!pending) onCancel();
      }}
    >
      <div
        className="w-full max-w-sm overflow-hidden rounded-t-3xl border border-border bg-card shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border/60 px-5 py-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-gold" />
            <span className="font-display text-base font-bold">
              {count > 1 ? t("chips.open_confirm_title_many") : t("chips.open_confirm_title_one")}
            </span>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            aria-label={t("common.cancel")}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Снизу-лист упирается в край экрана: на телефонах с домашней полосой
            кнопка «Открыть» оказалась бы под ней. Отступ держит её выше. */}
        <div className="space-y-4 px-5 pt-4 pb-[calc(env(safe-area-inset-bottom)+16px)] sm:pb-4">
          <div className="flex items-center gap-3">
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-gold/30 bg-secondary/40">
              {imageUrl ? (
                <img src={thumb(imageUrl, 128)} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  <Box className="h-6 w-6" />
                </div>
              )}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{packName}</div>
              <div className="text-xs text-muted-foreground">
                {count > 1
                  ? t("chips.open_confirm_count_many", { n: count })
                  : t("chips.open_confirm_count_one")}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gold/30 bg-gold/5 p-3 text-[13px] leading-snug text-muted-foreground">
            {t("chips.open_confirm_warn")}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={pending}
              className="flex-1 rounded-xl border border-border bg-secondary/40 px-4 py-2.5 text-sm font-medium text-muted-foreground transition hover:bg-secondary disabled:opacity-50"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={pending}
              className="flex-[2] inline-flex items-center justify-center gap-2 rounded-xl gradient-gold px-4 py-2.5 text-sm font-bold text-gold-foreground shadow-gold transition hover:scale-[1.01] disabled:opacity-60"
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {count > 1 ? t("chips.open_n", { n: count }) : t("chips.open")}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
