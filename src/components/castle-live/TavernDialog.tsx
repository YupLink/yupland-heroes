import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { tgFullscreenTop } from "@/lib/telegram/mobileFullscreen";

/** Keeps existing sheet layouts while sharing modal focus and dismissal behavior. */
export function TavernDialog({
  title,
  variant,
  onClose,
  locked = false,
  children,
  className,
  style,
  returnFocusRef,
  overlayClassName = "fixed inset-0 z-[120] flex items-end justify-center bg-black/70 sm:items-center sm:p-4",
}: {
  title: string;
  variant?: "convert" | "item";
  onClose: () => void;
  locked?: boolean;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  returnFocusRef?: RefObject<HTMLElement | null>;
  overlayClassName?: string;
}) {
  // These dialogs are mounted by existing buttons rather than Dialog.Trigger.
  const [opener] = useState(() =>
    typeof document !== "undefined" && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );
  const [content, setContent] = useState<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const setDialogContent = useCallback((node: HTMLDivElement | null) => {
    contentRef.current = node;
    setContent(node);
  }, []);
  const [anchor] = useState(() => opener?.getBoundingClientRect());
  const [position, setPosition] = useState<CSSProperties>({});
  useLayoutEffect(() => {
    if (variant !== "item" || !anchor) return;
    const place = () => {
      const card = content?.getBoundingClientRect();
      if (!card) return;
      const gap = 10;
      const edge = 16;
      const width = window.innerWidth;
      const height = window.innerHeight;
      // В полном экране Telegram верх занят его кнопками — карточка ниже них.
      const topEdge = edge + tgFullscreenTop();
      // Prefer the space immediately above the clicked item; use below if needed.
      const preferredTop =
        anchor.top >= card.height + gap + topEdge
          ? anchor.top - card.height - gap
          : anchor.bottom + gap;
      setPosition({
        position: "fixed",
        left: Math.max(edge, Math.min(anchor.left, width - card.width - edge)),
        top: Math.max(topEdge, Math.min(preferredTop, height - card.height - edge)),
        bottom: "auto",
        margin: 0,
      });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [variant, anchor, content]);
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !locked) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={overlayClassName} onClick={(event) => event.stopPropagation()}>
          <Dialog.Content
            ref={setDialogContent}
            data-tavern-style
            data-tavern-dialog
            data-tavern-item={variant === "item" ? "" : undefined}
            data-tavern-convert={variant === "convert" ? "" : undefined}
            className={className}
            style={{ ...style, ...position }}
            tabIndex={-1}
            aria-describedby={undefined}
            onOpenAutoFocus={(event) => {
              if (variant === "convert") {
                event.preventDefault();
                contentRef.current?.focus();
              }
            }}
            onEscapeKeyDown={(event) => {
              if (locked) event.preventDefault();
            }}
            onPointerDownOutside={(event) => {
              if (locked) event.preventDefault();
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              if (opener?.isConnected) opener.focus({ preventScroll: true });
              else returnFocusRef?.current?.focus({ preventScroll: true });
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
