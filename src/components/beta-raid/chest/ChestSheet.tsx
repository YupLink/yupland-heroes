// Каркас окон сундука: шторка снизу на телефоне, карточка по центру на ПК —
// как окно постройки. Порталом в body: окно добычи открывается и из окна
// «Добыча» (у того своя модалка с размытием, внутри неё fixed съезжает).
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

/** Цвет подписи над заголовком: свой, чужой, добыча. */
export type ChestTone = "own" | "foreign" | "loot";

const TONE: Record<ChestTone, string> = {
  own: "text-emerald-300",
  foreign: "text-destructive",
  loot: "text-gold",
};

export function ChestSheet({
  title,
  subtitle,
  tone,
  onClose,
  layer = "z-[110]",
  children,
}: {
  title: string;
  subtitle: string;
  tone: ChestTone;
  onClose: () => void;
  /** Слой окна: поверх окна «Добыча» — выше его z-[110]. */
  layer?: string;
  children: ReactNode;
}) {
  const t = useT();
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className={cn(
        "fixed inset-0 flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center",
        layer,
      )}
      onClick={onClose}
    >
      <div
        className="flex max-h-[85dvh] w-full max-w-sm flex-col overflow-y-auto overscroll-contain rounded-t-3xl border border-border bg-background p-4 pb-[calc(env(safe-area-inset-bottom)+84px)] sm:max-h-[88vh] sm:rounded-3xl sm:pb-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div
              className={cn(
                "truncate text-[10px] font-semibold uppercase tracking-widest",
                TONE[tone],
              )}
            >
              {subtitle}
            </div>
            <h3 className="truncate font-display text-lg font-bold">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
