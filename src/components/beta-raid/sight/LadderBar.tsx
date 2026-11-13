// Плашка режима «Лестница» над картой: подсказка и «Отмена» (§8.121).
import { Footprints, X } from "lucide-react";
import { useT } from "@/lib/i18n";
import { stopLadderMode, useLadderMode } from "./ladderMode";

export function LadderBar() {
  const t = useT();
  const on = useLadderMode();
  if (!on) return null;
  return (
    <div className="pointer-events-auto absolute left-1/2 top-16 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-2xl border border-sky-300/50 bg-black/80 px-3 py-2 text-sm font-bold text-sky-200 backdrop-blur-sm">
      <Footprints className="h-4 w-4 shrink-0" />
      <span className="whitespace-nowrap">{t("braid.ladder_pick")}</span>
      <button
        type="button"
        onClick={stopLadderMode}
        className="ml-1 inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-semibold text-foreground"
      >
        <X className="h-3.5 w-3.5" />
        {t("braid.ladder_cancel")}
      </button>
    </div>
  );
}
