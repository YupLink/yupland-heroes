import { useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";

// Resource sheets can open inside the hero dialog. Register the child with
// the same modal manager so its controls remain clickable and focusable.
export function ResourceActionDialog({
  title, busy = false, onClose, overlayClassName, className, children,
}: {
  title: string;
  busy?: boolean;
  onClose: () => void;
  overlayClassName: string;
  className: string;
  children: ReactNode;
}) {
  const [opener] = useState(() =>
    typeof document !== "undefined" && typeof HTMLElement !== "undefined" &&
    document.activeElement instanceof HTMLElement
      ? document.activeElement : null,
  );
  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className={overlayClassName} onClick={(event) => event.stopPropagation()}>
          <Dialog.Content
            className={className}
            aria-describedby={undefined}
            onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }}
            onPointerDownOutside={(event) => { if (busy) event.preventDefault(); }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              if (opener?.isConnected) opener.focus({ preventScroll: true });
            }}
          >
            <Dialog.Title className="sr-only">{title}</Dialog.Title>
            {children}
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
