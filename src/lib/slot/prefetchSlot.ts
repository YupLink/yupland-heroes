// Предзагрузка автомата казино: отдельный крошечный модуль, чтобы окно постройки
// не тянуло в карту весь код слота. Ключ и свежесть — общие с useSlotGame.
import type { QueryClient } from "@tanstack/react-query";
import { slotLoad } from "@/server/api/slot/slot-api";
import { SYMBOLS } from "./symbols";

export const SLOT_KEY = ["slot-state"] as const;
/** Сколько свежим считается состояние из предзагрузки. */
export const SLOT_FRESH_MS = 5_000;

const CABINET = "/slot/cabinet/assets/";
/** Картинки, без которых автомат пустой: корпус, шапка, пульт, кнопки, символы барабанов. */
const WARM_IMAGES = [
  `${CABINET}slot-cabinet-2026-10-12.webp`,
  `${CABINET}slot-header-no-map-2026-10-13.webp`,
  `${CABINET}control-deck-approved-blank-buttons-2026-10-14.webp`,
  `${CABINET}button-line-3states-2026-10-13-lite-v1.webp`,
  `${CABINET}button-rules-3states-2026-10-13-lite-v1.webp`,
  `${CABINET}button-auto-3states-2026-10-13-lite-v1.webp`,
  ...SYMBOLS.map((s) => s.img),
  "/design-assets/gear-slot-frame.webp",
];
let warmed = false;

/** Положить картинки в кэш браузера — иначе они поехали бы только после данных и кода. */
function warmImages(): void {
  if (warmed || typeof Image === "undefined") return;
  warmed = true;
  for (const src of WARM_IMAGES) {
    const img = new Image();
    img.decoding = "async";
    img.src = src;
  }
}

/** Заранее подтянуть код, картинки и состояние автомата — пока игрок смотрит окно казино. */
export function prefetchSlot(qc: QueryClient): void {
  warmImages();
  void import("@/components/slot/SlotScreen");
  void qc.prefetchQuery({ queryKey: SLOT_KEY, queryFn: () => slotLoad(), staleTime: 0 });
}
