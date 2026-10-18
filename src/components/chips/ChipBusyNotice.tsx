// Показ занятости фишки: метка на картинке и пояснение под ней.
// Вынесено из ChipDetailModal — карточка и без того переросла лимит, а плашка
// нужна одинаковой везде, где фишку показывают крупно.
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { CHIP_BUSY_HINT, type ChipBusyView } from "./chipBusy";

/** Цвет картинки: оглушение — сепия, отдых — серый. Один код на все экраны. */
export function chipBusyImageClass(busy: ChipBusyView | null): string {
  if (!busy) return "";
  return busy.kind === "stun" ? "sepia brightness-75" : "grayscale";
}

/** Метка поверх картинки: «В себя придёт через 1 ч 12 мин». */
export function ChipBusyBadge({ busy }: { busy: ChipBusyView }) {
  return (
    <span
      className={cn(
        "absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold backdrop-blur",
        busy.kind === "stun" ? "bg-amber-500/90 text-black" : "bg-black/75 text-slate-200",
      )}
    >
      {busy.hint}
    </span>
  );
}

/** Пояснение, почему фишка сейчас никуда не годится. */
export function ChipBusyNotice({ busy }: { busy: ChipBusyView }) {
  const t = useT();
  return (
    <div
      className={cn(
        "mt-1 flex items-center gap-2 rounded-xl border px-3 py-2.5 text-[11px] leading-snug",
        busy.kind === "stun"
          ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
          : "border-slate-500/40 bg-slate-500/10 text-slate-300",
      )}
    >
      <span>
        <b className="text-slate-100">{busy.hint}</b> · {t(CHIP_BUSY_HINT[busy.kind])}
      </span>
    </div>
  );
}
