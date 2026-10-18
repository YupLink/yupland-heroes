import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import "./castle-gate-dialog.css";
export function CastleGateDialog({
  open,
  onClose,
  onCity,
  onReturnFocus,
  ru,
}: {
  open: boolean;
  onClose: () => void;
  onCity?: () => void;
  onReturnFocus?: () => void;
  ru: boolean;
}) {
  const [error, setError] = useState(false);
  useEffect(() => {
    if (open) setError(false);
  }, [open]);
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) {
          setError(false);
          onClose();
        }
      }}
    >
      <DialogContent
        onCloseAutoFocus={(e) => {
          if (onReturnFocus) {
            e.preventDefault();
            requestAnimationFrame(onReturnFocus);
          }
        }}
        closeLabel={ru ? "Закрыть" : "Close"}
        className="castle-gate-dialog"
      >
        {/* По-английски заголовок раньше звал «войти», а кнопка отвечала
            «выйти» — одно действие, одно слово. */}
        <DialogTitle className="castle-gate-dialog__title">{ru ? "Выйти в мир?" : "Leave for the world?"}</DialogTitle>
        <DialogDescription className="castle-gate-dialog__description">
          {ru ? "Ты покинешь внутренний замок." : "You will leave the castle interior."}
        </DialogDescription>
        {error && (
          <p role="alert" className="castle-gate-dialog__error">
            {ru
              ? "Переход в город пока не подключён."
              : "The city destination is not connected yet."}
          </p>
        )}
        <div className="castle-gate-dialog__actions">
          <button type="button" data-game-button="secondary" className="castle-gate-dialog__stay" onClick={onClose}>
            {ru ? "Остаться" : "Stay"}
          </button>
          <button type="button" data-game-button="primary"
            className="castle-gate-dialog__leave"
            onClick={() => {
              if (!onCity) {
                setError(true);
                return;
              }
              onCity();
              onClose();
            }}
          >
            {ru ? "Выйти" : "Leave"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
