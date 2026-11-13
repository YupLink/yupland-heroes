// Окна острова в стиле окон замка: приветствие на острове и «ты в основном
// мире» после портала. Закрыть = прочитано (сервер помнит, второй раз не всплывёт).
// Слой 150: выше окон карты (140), ниже всплывашек из профиля (≥160).
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useLang, useT } from "@/lib/i18n";
import { IslandSkipControl } from "./IslandSkipControl";
import { useHoldLetters } from "@/components/letters/letterHold";
import "./island.css";

export function IslandDialog({
  kind,
  busy,
  onClose,
  tutorialPilot = false,
  leadToTavern = false,
}: {
  kind: "hello" | "final";
  busy?: boolean;
  onClose: () => void;
  tutorialPilot?: boolean;
  leadToTavern?: boolean;
}) {
  const t = useT();
  const ru = useLang() === "ru";
  // Окно модальное: письмо поверх него не нажать — пусть подождёт.
  useHoldLetters("island-dialog", true);
  if (kind === "hello" && tutorialPilot) {
    return (
      <section className="island-intro" aria-label={ru ? "Твой остров" : "Your island"}>
        <div className="island-dialog__skip">
          <IslandSkipControl skipped={false} />
        </div>
        <h1>{ru ? "Привет, это твой первый остров." : "Welcome to your first island."}</h1>
        <p>{leadToTavern
          ? (ru ? "Войди в замок через ратушу и открой карточку своего героя в таверне." : "Enter the castle through the Town Hall and open your hero's card in the Tavern.")
          : (ru ? "Здесь только ты. Выбери героя — и начнём исследовать территорию." : "You're on your own here. Choose a hero to start exploring.")}</p>
        <button type="button" data-game-button="primary" disabled={busy} onClick={onClose}>
          {leadToTavern ? (ru ? "К замку" : "To the castle") : (ru ? "Выбрать героя" : "Choose your hero")}
        </button>
      </section>
    );
  }
  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent
        closeLabel={ru ? "Закрыть" : "Close"}
        className="island-dialog z-[150]"
        overlayClassName="z-[149]"
      >
        {kind === "hello" && tutorialPilot && (
          <div className="island-dialog__skip">
            <IslandSkipControl skipped={false} />
          </div>
        )}
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
