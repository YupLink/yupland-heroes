// Окно «Шахты и лесопилка» шага «mine» — вынесено из панели острова (файл ≤250 строк).
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { IslandSkipControl } from "./IslandSkipControl";

export function IslandMineIntro({ onClose }: { onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="island-dialog island-mine-intro z-[150]"
        overlayClassName="z-[149]"
        closeLabel="Закрыть"
      >
        <div className="island-dialog__skip">
          <IslandSkipControl skipped={false} />
        </div>
        <DialogTitle className="island-dialog__title">Шахты и лесопилка</DialogTitle>
        <DialogDescription className="island-dialog__text">
          Ты уже умеешь добывать камень. Эти постройки дают ресурсы со временем:
        </DialogDescription>
        <ul className="island-mine-intro__list">
          <li>
            <img src="/design-assets/tutorial-mines/sawmill.webp" alt="" />
            <b>Лесопилка</b>
            <span>Брёвна</span>
          </li>
          <li>
            <img src="/design-assets/tutorial-mines/stone-mine.webp" alt="" />
            <b>Каменная шахта</b>
            <span>Камень</span>
          </li>
          <li>
            <img src="/design-assets/tutorial-mines/gold-mine.webp" alt="" />
            <b>Золотая шахта</b>
            <span>Золото</span>
          </li>
          <li>
            <img src="/design-assets/tutorial-mines/diamond-mine.webp" alt="" />
            <b>Алмазная шахта</b>
            <span>Алмазы</span>
          </li>
        </ul>
        <p className="island-mine-intro__next">Попробуй захватить лесопилку на карте.</p>
        <div className="island-dialog__actions">
          <button
            type="button"
            data-game-button="primary"
            className="island-dialog__go"
            onClick={onClose}
          >
            Найти лесопилку
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
