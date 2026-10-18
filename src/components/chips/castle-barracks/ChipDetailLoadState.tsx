import { useEffect, useRef } from "react";

export function ChipDetailLoadState({
  ru,
  error,
  onRetry,
  onClose,
}: {
  ru: boolean;
  error: boolean;
  onRetry: () => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    dialog.current?.focus();
  }, []);
  return (
    <div
      className="fixed inset-0 z-[110] flex items-end justify-center bg-black/80 backdrop-blur-md sm:items-center"
      onClick={onClose}
    >
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={ru ? "Карточка фишки" : "Chip details"}
        tabIndex={-1}
        className="w-full max-w-md space-y-4 rounded-t-3xl border border-gold/30 bg-card px-4 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-6 text-foreground sm:rounded-3xl sm:pb-6"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
      >
        <p role={error ? "alert" : "status"}>
          {error
            ? ru
              ? "Не удалось загрузить карточку фишки."
              : "Could not load chip details."
            : ru
              ? "Загружаем карточку фишки…"
              : "Loading chip details…"}
        </p>
        <div className="flex flex-wrap gap-2">
          {error && (
            <button
              data-game-button="secondary"
              type="button"
              className="min-h-11 rounded-xl border border-border px-4"
              onClick={onRetry}
            >
              {ru ? "Повторить" : "Retry"}
            </button>
          )}
          <button
            data-game-button="secondary"
            type="button"
            className="min-h-11 rounded-xl border border-border px-4"
            onClick={onClose}
          >
            {ru ? "Закрыть" : "Close"}
          </button>
        </div>
      </div>
    </div>
  );
}
