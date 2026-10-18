// Оболочка окна счёта: снизу на телефоне, по центру на десктопе.
//
// Запас снизу и своя прокрутка тела — не украшение: без них низ окна уезжает
// под нижнюю навигацию, и кнопка действия становится недоступной именно на
// телефоне, где ей и пользуются.
//
// Слой 165 — выше полноэкранных окон на карте (профиль с Казной — 140):
// на 100 окно монеты открывалось под Казной, и «кнопки не работали».
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export function AccountModal({
  title,
  icon,
  onClose,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[165] flex items-end justify-center bg-black/80 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-gold/25 bg-card shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/60 px-5 py-4">
          <span className="inline-flex items-center gap-2 font-display text-base font-bold">
            {icon}
            {title}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-secondary hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-5 py-4 pb-[calc(env(safe-area-inset-bottom)+84px)] sm:pb-4">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
