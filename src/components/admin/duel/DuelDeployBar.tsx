// Расстановка до боя: подсказка и «В бой» (Ярослав 08.11: «самый старт — расставить
// воинов»). Зона и выбранный боец — на поле (canvas/marks).
import { Swords } from "lucide-react";
import type { DuelText } from "./duelText";

export function DuelDeployBar({ onStart, t }: { onStart: () => void; t: DuelText }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-gold/40 bg-card p-3">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-bold text-gold">{t.deployTitle}</p>
        <p className="text-[11.5px] text-muted-foreground">{t.deployHint}</p>
      </div>
      <button
        type="button"
        onClick={onStart}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-xl gradient-gold px-4 py-2.5 text-[13px] font-bold text-gold-foreground"
      >
        <Swords className="h-4 w-4" />
        {t.toBattle}
      </button>
    </div>
  );
}
