// Выбор фишки на свободное место — тем же списком, что и в прежнем стейкинге.
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { ChipImage } from "@/components/ChipImage";
import { useT } from "@/lib/i18n";
import { likesLabel } from "@/lib/university";
import type { SlotChip } from "./UniversitySlots";

export function UniversityPicker({
  chips,
  busy,
  onPick,
  onClose,
}: {
  chips: SlotChip[];
  busy: boolean;
  onPick: (chipId: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const body = (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 sm:items-center sm:p-4">
      <div className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-gold/30 bg-card p-4 pb-[calc(env(safe-area-inset-bottom)+16px)] sm:rounded-3xl sm:pb-4">
        <div className="mb-3 flex items-center gap-2">
          <b className="flex-1">{t("braid.uni_pick_title")}</b>
          <button onClick={onClose} className="text-muted-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        {chips.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t("braid.uni_none_free")}
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {chips.map((c) => (
              <button
                key={c.chipId}
                type="button"
                disabled={busy}
                onClick={() => onPick(c.chipId)}
                className="overflow-hidden rounded-2xl border border-border bg-card/80 text-left transition hover:border-gold/50 disabled:opacity-60"
              >
                <ChipImage src={c.imageUrl ?? ""} level={c.level} alt={c.name} className="w-full" />
                <div className="px-1 py-0.5 text-[9px] text-muted-foreground">
                  {c.level}★{c.serialNo ? ` #${c.serialNo}` : ""}
                </div>
                <div className="px-1 pb-1 text-[9px] font-bold text-gold">
                  {t("braid.uni_per_day", { n: likesLabel(c.ratePerDay) })}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
  return typeof document === "undefined" ? body : createPortal(body, document.body);
}
