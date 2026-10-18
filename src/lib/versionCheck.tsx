// Version-check: клиент знает свою BUILD_ID (из vite define) и периодически
// сверяет с серверной через GET /api/version. При расхождении выставляет
// `outdated=true` — баннер и critical-action-guard'ы подхватывают.

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { BUILD_ID } from "@/lib/buildId";

type Ctx = {
  outdated: boolean;
  serverBuild: string | null;
  reload: () => void;
};
const VersionCtx = createContext<Ctx>({
  outdated: false,
  serverBuild: null,
  reload: () => {
    if (typeof window !== "undefined") forceReloadBustCache();
  },
});

export function useVersion() {
  return useContext(VersionCtx);
}

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // раз в 5 мин

/**
 * «Жёсткая» перезагрузка с обходом HTTP-кэша. window.location.reload() в
 * Safari часто отдаёт страницу из disk-cache даже при cache-control
 * `must-revalidate` — и тогда юзер по кругу тыкает «Обновить», а bundle
 * остаётся старый.
 *
 * Стратегия:
 *  1. Чистим все Cache Storage (если есть Service Worker / PWA-кэш).
 *  2. Снимаем регистрации Service Worker'ов (на случай если когда-то
 *     заводили).
 *  3. Делаем navigation на URL с cache-bust query-param + hard reload.
 *     Браузер запросит свежий HTML, а HTML потащит свежие JS-чанки.
 *
 * Шаги 1-2 опциональны (могут не отработать, в Safari Cache Storage API
 * не всегда есть) — но шаг 3 всегда срабатывает.
 */
async function forceReloadBustCache(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    /* no-op */
  }
  try {
    if (
      typeof navigator !== "undefined" &&
      "serviceWorker" in navigator
    ) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch {
    /* no-op */
  }
  // Cache-bust: добавляем ?_v=timestamp. Если уже есть наш _v — заменяем.
  const url = new URL(window.location.href);
  url.searchParams.set("_v", String(Date.now()));
  window.location.replace(url.toString());
}

// Один раз на жизнь страницы патчим window.fetch — добавляем
// X-Client-Build header во все наши запросы. Сервер проверяет этот
// header в requireFreshClient() на критичных endpoint'ах. Старые
// клиенты header не шлют → попадают на «Сессия устарела».
function patchFetchOnce(): void {
  if (typeof window === "undefined") return;
  type Patched = Window & { __buildHeaderPatched__?: boolean };
  const w = window as Patched;
  if (w.__buildHeaderPatched__) return;
  w.__buildHeaderPatched__ = true;

  const orig = window.fetch.bind(window);
  window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
    let url: string;
    try {
      url = typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    } catch {
      return orig(input, init);
    }
    // Шлём только на свой backend (server fn endpoints и /api/*).
    const isOurs =
      url.startsWith("/_serverFn/") ||
      url.startsWith("/api/") ||
      url.includes(window.location.host);
    if (!isOurs) return orig(input, init);

    const newInit: RequestInit = { ...init };
    const h = new Headers(newInit.headers);
    if (!h.has("X-Client-Build")) h.set("X-Client-Build", BUILD_ID);
    newInit.headers = h;
    return orig(input, newInit);
  } as typeof window.fetch;
}

export function VersionProvider({ children }: { children: ReactNode }) {
  const [outdated, setOutdated] = useState(false);
  const [serverBuild, setServerBuild] = useState<string | null>(null);

  useEffect(() => {
    // На SSR не запускаем (window не доступен).
    if (typeof window === "undefined") return;
    patchFetchOnce();

    let cancelled = false;
    let inFlight = false;

    async function check() {
      if (inFlight) return;
      inFlight = true;
      try {
        const r = await fetch("/api/version", {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!r.ok) return;
        const j = (await r.json()) as { build?: string };
        const sb = j.build ?? null;
        if (cancelled) return;
        setServerBuild(sb);
        if (sb && BUILD_ID && sb !== BUILD_ID) {
          setOutdated(true);
        }
      } catch {
        /* сеть отпала — игнор, попробуем позже */
      } finally {
        inFlight = false;
      }
    }

    // Проверяем сразу + по таймеру + на focus/visibilitychange
    check();
    const interval = window.setInterval(check, CHECK_INTERVAL_MS);
    const onFocus = () => check();
    const onVis = () => {
      if (document.visibilityState === "visible") check();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const reload = () => {
    if (typeof window !== "undefined") forceReloadBustCache();
  };

  return (
    <VersionCtx.Provider value={{ outdated, serverBuild, reload }}>
      {children}
    </VersionCtx.Provider>
  );
}
