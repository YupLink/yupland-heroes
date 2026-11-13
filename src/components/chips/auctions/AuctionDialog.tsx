import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/** Native modal focus containment, Escape and return to the opening control. */
export function AuctionDialog({ title, closeLabel, onClose, children }: {
  title: string; closeLabel: string; onClose: () => void; children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal();
    return () => { dialog?.close(); opener?.focus(); };
  }, []);
  return (
    <dialog ref={ref} className="auction-dialog" aria-labelledby={titleId}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onKeyDown={(e) => { if (e.key === "Escape") e.stopPropagation(); }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="auction-dialog__content">
        <header><h2 id={titleId}>{title}</h2>
          <button type="button" className="auction-dialog__close" aria-label={closeLabel} onClick={onClose}><X /></button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
