// Загрузка автомата: вошёл — состояние с сервера на золото; гость (slot.guest) —
// холостая игра в браузере (demoSlot), её код подтягивается только гостю.
import { slotLoad, type SlotView } from "@/server/api/slot/slot-api";
import type { DemoSlot } from "./demoSlot";

export type DemoRef = { current: DemoSlot | null };

export async function loadSlot(demo: DemoRef): Promise<SlotView> {
  try {
    const v = await slotLoad();
    demo.current = null;
    return v;
  } catch (e) {
    if (!String((e as Error)?.message ?? e).includes("slot.guest")) throw e;
    demo.current ??= (await import("./demoSlot")).demoSlot();
    return demo.current.view();
  }
}
