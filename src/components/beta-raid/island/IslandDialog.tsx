// Окна острова в стиле окон замка: приветствие на острове и «ты в основном
// мире» после портала. Закрыть = прочитано (сервер помнит, второй раз не всплывёт).
// Слой 150: выше окон карты (140), ниже всплывашек из профиля (≥160).
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useLang, useT } from "@/lib/i18n";
import "./island.css";

export function IslandDialog({
  kind,
  busy,
  onClose,
}: {
  kind: "hello" | "final";
  busy?: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const ru = useLang() === "ru";
  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent
        closeLabel={ru ? "Закрыть" : "Close"}
        className="island-dialog z-[150]"
        overlayClassName="z-[149]"
      >
        <DialogTitle className="island-dialog__title">{t(`island.${kind}.title`)}</DialogTitle>
        <DialogDescription className="island-dialog__text">
          {t(`island.${kind}.text`)}
        </DialogDescription>
        <div className="island-dialog__actions">
          <button
            type="button"
            data-game-button="primary"
            className="island-dialog__go"
            disabled={busy}
            onClick={onClose}
          >
            {t(`island.${kind}.go`)}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
