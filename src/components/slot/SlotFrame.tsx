// Оболочка слота в стиле окон замка (дизайн Ангелины, tavern.css): полноэкранная
// секция, шапка со стрелкой «Карта» и заголовком, рамки gear-slot-frame.
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import "@/components/castle-live/tavern.css";
import "./slot-frame.css";

export function SlotFrame({
  title,
  ru,
  children,
  onClose,
}: {
  title: string;
  ru: boolean;
  children: React.ReactNode;
  /** Закрыть (казино на карте); нет — переход на карту /chips. */
  onClose?: () => void;
}) {
  const navigate = useNavigate();
  return (
    <section
      role="dialog"
      aria-modal="true"
      aria-labelledby="castle-window-title"
      data-tavern-style=""
      data-slot-frame=""
      className="fixed inset-0 z-[140] flex flex-col bg-background text-foreground"
    >
      <header className="flex shrink-0 items-center gap-3 border-b p-3 pt-[max(12px,var(--app-top,env(safe-area-inset-top,0px)))]">
        <button
          type="button"
          className="flex min-h-11 items-center gap-1 rounded-lg border px-3"
          onClick={onClose ?? (() => void navigate({ to: "/chips" }))}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {ru ? "Карта" : "Map"}
        </button>
        <h1 id="castle-window-title" className="font-bold">
          {title}
        </h1>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-md">{children}</div>
      </div>
    </section>
  );
}
