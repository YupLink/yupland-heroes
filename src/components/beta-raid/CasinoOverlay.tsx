// Казино поверх карты: слот на золото на весь экран. Рисуется порталом в body —
// окно постройки (Radix) сдвинуто transform'ом, и fixed внутри него встал бы
// не на весь экран, а в рамку окна. Слот грузится лениво: на карте его код не
// нужен, пока казино не открыли.
import { lazy, Suspense } from "react";
import { createPortal } from "react-dom";

const SlotScreen = lazy(() =>
  import("@/components/slot/SlotScreen").then((m) => ({ default: m.SlotScreen })),
);

export function CasinoOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <Suspense fallback={null}>
      <SlotScreen onClose={onClose} />
    </Suspense>,
    document.body,
  );
}
