// Экран таверны замка у любой таверны мира (владелец, 07.10.2026): постройки
// Таверны в замке больше нет. Тот же TavernWindow, что был в замке, — поверх
// карты; смена героя за лайки у таверны мира остаётся своей кнопкой.
import { ArrowLeft } from "lucide-react";
import { TavernWindow } from "./TavernWindow";

export function CastleTavernOverlay({ ru, onClose, initialSection = "heroes" }: { ru: boolean; onClose: () => void; initialSection?: "heroes" | "artifacts" }) {
  return (
    <section
      role="dialog"
      aria-modal="true"
      aria-labelledby="castle-window-title"
      data-tavern-style=""
      className="fixed inset-0 z-[140] flex flex-col bg-background text-foreground"
    >
      <header className="flex shrink-0 items-center gap-3 border-b p-3 pt-[max(12px,env(safe-area-inset-top))]">
        <button type="button" className="flex min-h-11 items-center gap-1 rounded-lg border px-3" onClick={onClose}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {ru ? "Карта" : "Map"}
        </button>
        <h1 id="castle-window-title" className="font-bold">
          {ru ? "Таверна" : "Tavern"}
        </h1>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-3xl">
          <TavernWindow onClose={onClose} initialSection={initialSection} />
        </div>
      </div>
    </section>
  );
}
