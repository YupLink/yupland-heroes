// Тихое «лечение» устаревшей страницы (владелец, 28.10.2026: «не просилось перезагружаться,
// а перезагружалась сама — пользователя никуда не гонять, не выбивать из ритма»).
//
//  · Кусок кода не загрузился (после выката старый файл пропал, сеть моргнула на импорте) —
//    одна тихая перезагрузка, не чаще раза в 30 с: петля не помогает, одна — лечит.
//  · Вышла новая версия — перезагрузка тогда, когда игрок её не заметит: свернул игру
//    или полторы минуты ничего не нажимал и герой не шёл (versionCheck). Не чаще раза в 10 минут.
// Старые файлы сервер теперь и так отдаёт из архива (server/assetArchive) — это запасной путь.
import { forceReloadBustCache } from "@/lib/versionCheck";

/** Упала не логика, а подгрузка куска кода (импорт модуля). */
export function isStaleChunkError(error: unknown): boolean {
  const m = String(error instanceof Error ? error.message : (error ?? "")).toLowerCase();
  return (
    m.includes("dynamically imported module") ||
    m.includes("importing a module script failed") ||
    m.includes("failed to fetch") ||
    m.includes("is not a valid javascript mime type") ||
    m.includes("error loading") ||
    m.includes("chunkloaderror")
  );
}

function since(key: string): number {
  try {
    return Date.now() - Number(sessionStorage.getItem(key) ?? 0);
  } catch {
    return Infinity;
  }
}

function reloadNow(key: string): void {
  try {
    sessionStorage.setItem(key, String(Date.now()));
  } catch {
    /* приватный режим — перезагрузимся без отметки */
  }
  void forceReloadBustCache();
}

/** Тихо перезагрузиться, если по этому поводу (key) не перезагружались последние gapMs. */
export function reloadQuietly(key: string, gapMs: number): boolean {
  if (typeof window === "undefined" || since(key) < gapMs) return false;
  reloadNow(key);
  return true;
}

/** Перезагрузиться из-за куска кода. true — перезагрузка пошла (ошибку игроку не показывать). */
export const reloadForStaleChunk = (): boolean => reloadQuietly("chunk-reload-at", 30_000);

/** Подгрузку перед импортом (vite:preloadError) — тоже тихой перезагрузкой. */
export function installStaleChunkReload(): () => void {
  const onError = (e: Event) => {
    if (reloadForStaleChunk()) e.preventDefault();
  };
  window.addEventListener("vite:preloadError", onError);
  return () => window.removeEventListener("vite:preloadError", onError);
}

/** Сколько игрок может ничего не нажимать, чтобы обновление прошло незаметно. */
const IDLE_MS = 90_000;
/** Последнее действие игры без касаний игрока: герой идёт маршрутом, идёт бой (запросы на запись). */
let lastAction = 0;
export function noteActivity(): void {
  lastAction = Date.now();
}

/**
 * Новая версия на сервере: перезагрузиться незаметно — когда игру свернули или игрок
 * давно ничего не нажимал. Вернёт «отменить» (страница ушла раньше).
 */
export function scheduleQuietUpdate(): () => void {
  if (typeof window === "undefined" || since("version-reload-at") < 10 * 60_000) return () => {};
  let last = Date.now();
  const touch = () => {
    last = Date.now();
  };
  const go = () => {
    stop();
    reloadNow("version-reload-at");
  };
  const onVis = () => {
    if (document.visibilityState === "hidden") go();
  };
  const timer = window.setInterval(() => {
    if (Date.now() - Math.max(last, lastAction) >= IDLE_MS) go();
  }, 10_000);
  const events = ["pointerdown", "keydown", "touchstart", "wheel"] as const;
  for (const ev of events) window.addEventListener(ev, touch, { passive: true });
  document.addEventListener("visibilitychange", onVis);
  function stop() {
    window.clearInterval(timer);
    for (const ev of events) window.removeEventListener(ev, touch);
    document.removeEventListener("visibilitychange", onVis);
  }
  if (document.visibilityState === "hidden") go();
  return stop;
}
