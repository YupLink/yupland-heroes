// Окно «сколько»: выбросить из рюкзака, положить на склад, забрать с него.
//
// Одна раскладка на все три: поле с −/+, быстрые «Ячейку (N)» и «Всё (N)» и
// кнопка действия. Раньше склад перекладывал вид целиком, без выбора, — одну
// штуку было не положить (жалоба 27.09.2026); окно выброса уже умело «сколько»,
// оно и стало общим. Снизу на телефоне, по центру на десктопе, с запасом под
// нижнюю панель приложения.
import { useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Loader2, X, type LucideIcon } from "lucide-react";
import { useT } from "@/lib/i18n";
import { thumb } from "@/lib/image";
import { cn } from "@/lib/utils";
import { useQtyInput } from "@/hooks/useQtyInput";
import { QtyField } from "./QtyField";

export function QtyDialog({
  name,
  image,
  haveKey,
  total,
  cell,
  icon: Icon,
  label,
  tone,
  note,
  busy,
  onSubmit,
  onClose,
}: {
  name: string;
  image: string | null;
  /** Ключ строки «сколько есть» с {n}: «В рюкзаке: {n}», «На складе: {n}». */
  haveKey: string;
  /** Сколько единиц есть — больше не выбрать. */
  total: number;
  /** «Ячейку»: столько окно предлагает сразу. */
  cell: number;
  icon: LucideIcon;
  label: string;
  tone: "danger" | "gold";
  /** Строка над кнопкой от выбранного количества (у выброса — сколько ячеек освободится). */
  note?: (qty: number) => ReactNode;
  busy: boolean;
  onSubmit: (qty: number) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [opener] = useState(() =>
    typeof document !== "undefined" && typeof HTMLElement !== "undefined" &&
    document.activeElement instanceof HTMLElement
      ? document.activeElement : null,
  );
  const q = useQtyInput({ max: total, initial: cell, presets: [cell, total] });
  const chip = "rounded-full border border-border px-3 py-1.5 text-[11px] font-semibold";

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <Dialog.Portal>
    <Dialog.Overlay
      className="fixed inset-0 z-[130] flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center"
      onClick={(event) => event.stopPropagation()}
    >
      <Dialog.Content
        className="mb-[calc(env(safe-area-inset-bottom)+76px)] w-full max-w-sm rounded-t-3xl border border-border bg-background p-4 sm:mb-0 sm:rounded-3xl"
        aria-describedby={undefined}
        onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }}
        onPointerDownOutside={(event) => { if (busy) event.preventDefault(); }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (opener?.isConnected) opener.focus({ preventScroll: true });
        }}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-secondary/40">
              {image ? (
                <img
                  src={thumb(image, 96, "black")}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <Icon className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
            <div className="min-w-0">
              <Dialog.Title asChild><h3 className="truncate font-display text-base font-bold">{name}</h3></Dialog.Title>
              <p className="text-[11px] text-muted-foreground">{t(haveKey, { n: q.fmt(total) })}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label={t("common.close")}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <QtyField q={q} tone={tone} className="mb-3" />

        {/* Быстрые доли: ячейка и «всё» — два самых частых намерения. */}
        <div className="mb-3 flex flex-wrap gap-1.5">
          <button type="button" onClick={() => q.set(cell)} className={chip}>
            {t("braid.backpack_one_cell", { n: q.fmt(cell) })}
          </button>
          <button type="button" onClick={() => q.set(total)} className={chip}>
            {t("braid.backpack_all", { n: q.fmt(total) })}
          </button>
        </div>

        {note && (
          <p className="mb-3 text-center text-[11px] text-muted-foreground">{note(q.value)}</p>
        )}

        <button
          type="button"
          onClick={() => onSubmit(q.commit())}
          disabled={busy}
          className={cn(
            "flex w-full items-center justify-center gap-1.5 rounded-2xl px-4 py-3 text-sm font-bold disabled:opacity-50",
            tone === "danger" ? "bg-destructive text-white" : "gradient-gold text-gold-foreground",
          )}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
          {label}
        </button>
      </Dialog.Content>
    </Dialog.Overlay>
    </Dialog.Portal>
    </Dialog.Root>
  );
}
