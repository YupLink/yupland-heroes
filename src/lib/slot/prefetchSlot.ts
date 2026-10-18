// Предзагрузка автомата казино: отдельный крошечный модуль, чтобы окно постройки
// не тянуло в карту весь код слота. Ключ и свежесть — общие с useSlotGame.
import type { QueryClient } from "@tanstack/react-query";
import { slotLoad } from "@/server/api/slot/slot-api";

export const SLOT_KEY = ["slot-state"] as const;
/** Сколько свежим считается состояние из предзагрузки. */
export const SLOT_FRESH_MS = 5_000;

/** Заранее подтянуть код автомата и состояние — пока игрок смотрит окно казино. */
export function prefetchSlot(qc: QueryClient): void {
  void import("@/components/slot/SlotScreen");
  void qc.prefetchQuery({ queryKey: SLOT_KEY, queryFn: () => slotLoad(), staleTime: 0 });
}
