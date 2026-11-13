// Каркас окна для кнопок HUD: «Добыча» и «Подарки» открываются одинаково.
//
// Размеры и отступы повторяют окно корабля (ShipModal): снизу оставлен запас
// под нижнюю панель телефона и своя прокрутка, иначе на маленьком экране
// содержимое уезжает под панель и не докручивается.
import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function HudModal({
  title,
  subtitle,
  icon,
  onClose,
  children,
  footer,
  presentation = "sheet",
  modalKind,
  layer = "default",
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** «centered» — окно по центру в оформлении замка (только замок, у рейда — «sheet»). */
  presentation?: "sheet" | "centered";
  modalKind?: "gifts" | "harvest";
  /** Окно паков в рейде должно быть ниже порталов подтверждения и приза. */
  layer?: "default" | "pack";
}) {
  const centered = presentation === "centered";
  // Окно замка закрывается и клавишей Escape (у рейда — как раньше).
  useEffect(() => {
    if (!centered) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [centered, onClose]);
  const t = useT();
  return (
    <div
      data-hud-modal={modalKind}
      data-hud-modal-centered={centered ? "" : undefined}
      className={cn(
        "fixed inset-0 flex justify-center bg-black/75 backdrop-blur-sm",
        layer === "pack" ? "z-40" : "z-[110]",
        centered ? "items-center px-3" : "items-end sm:items-center",
      )}
      onClick={onClose}
    >
      <div
        data-hud-modal-panel
        data-harvest-modal={centered && modalKind !== "gifts" ? "" : undefined}
        /* Окно поднято над нижней панелью приложения: без запаса карточки
           подарков и кнопки уезжали под неё и не докручивались. */
        className={cn(
          "flex w-full max-w-md flex-col overflow-hidden border",
          centered
            ? "max-h-[calc(100dvh-32px)] rounded-[28px] border-amber-400/55 bg-[#111315] shadow-[0_24px_70px_#000b,inset_0_1px_0_#e7b97355]"
            : "mb-[calc(env(safe-area-inset-bottom)+76px)] max-h-[calc(100dvh-180px)] rounded-t-3xl border-border bg-background sm:mb-0 sm:max-h-[85dvh] sm:rounded-3xl",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          data-hud-modal-header
          className={cn(
            "flex items-start justify-between gap-2 p-4",
            centered ? "pb-2" : "border-b border-border",
          )}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {icon}
              <h3 className="truncate font-display text-lg font-bold">{title}</h3>
            </div>
            {subtitle && <p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p>}
          </div>
          <button
            data-close-button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div
          data-hud-modal-body
          className={cn(
            "flex-1 space-y-3 overflow-y-auto overscroll-contain p-4",
            centered && "pt-2",
          )}
        >
          {children}
        </div>

        {footer && <div className="space-y-2 border-t border-border p-4">{footer}</div>}
      </div>
    </div>
  );
}
