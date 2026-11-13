// Часы авторассылок: раз в 5 минут каждый воркер проверяет правила (и сторож курса).
// Два воркера разом не разошлют дважды — у каждой рассылки свой замок в базе
// (незакрытая пачка на корзину одна; «Раздача DARAI» — не чаще раза в час).
// Покупка подписки проверяет корзины и сама, не дожидаясь часов.
import { runFreeDaraiAuto } from "./free-darai";

const EVERY_MS = 5 * 60_000;

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

export async function autoDistPass(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const { runDueBatches } = await import("../energy-sub/batch");
    await runDueBatches("auto").catch((e) => console.warn("[autodist] подписки:", e instanceof Error ? e.message : e));
    await runFreeDaraiAuto().catch((e) =>
      console.warn("[autodist] раздача DARAI:", e instanceof Error ? e.message : e),
    );
    // Сторож курса DARAI (04.11.2026): от него считаются все цены за DARAI от $.
    const { watchRate } = await import("../energy-sub/rate-watch");
    await watchRate().catch((e) => console.warn("[autodist] сторож курса:", e instanceof Error ? e.message : e));
  } finally {
    running = false;
  }
}

/** Запустить часы в этом процессе (лениво, с первого чтения подарков). Процесс не держат. */
export function startAutoDistTicker(): void {
  if (timer || typeof setInterval !== "function") return;
  timer = setInterval(() => void autoDistPass(), EVERY_MS);
  (timer as unknown as { unref?: () => void }).unref?.();
}
