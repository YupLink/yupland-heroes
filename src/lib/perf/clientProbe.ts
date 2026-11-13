// Проба нагрузки на устройстве игрока: что телефон делает на самом деле.
//
// Сервер меряет себя сам (server/perf), но игрок ждёт не сервер, а свой
// телефон: разбор ответа карты, сборку индекса, кадр канваса, сборщик мусора.
// Здесь это считается там, где происходит, и раз в минуту уезжает одной
// строкой на /api/perf-client (см. probeTypes): квантили кадров, длинные
// задачи (>50 мс), куча, каждый серверный вызов — имя, время, байты.
//
// Дёшево по устройству: кадр записывает одно число в массив; ответы сервера
// берутся из PerformanceObserver — браузер и так их считает; отправка —
// sendBeacon, не мешает ни кадру, ни уходу со страницы. Пока экран рейда не
// открыт, проба выключена и probeFrame — одна проверка флага.
import { BUILD_ID } from "@/lib/buildId";
import {
  emptyWindow,
  summarize,
  worthSending,
  type Device,
  type ProbeWindow,
} from "./probeSummary";

const SEND_EVERY_MS = 60_000;
const ENDPOINT = "/api/perf-client";
/** Сколько кадров держим в окне: при 60 fps минута — 3600, больше не надо. */
const MAX_FRAMES = 4000;

let active = false;
let win: ProbeWindow | null = null;
let pageOpenedAt = 0;
/** id server-функции → имя (приходит заголовком x-fn, см. serverFnTransport). */
const names = new Map<string, string>();

/** Кадр канваса: длительность, шёл ли он при движении, сколько клеток. */
export function probeFrame(ms: number, moving: boolean, cells: number): void {
  if (!active || !win) return;
  if (win.frameMs.length >= MAX_FRAMES) return;
  win.frameMs.push(ms);
  win.frameCells.push(cells);
  if (moving) win.movingFrames++;
}

/** Событие живого потока (useRaidLiveStream). */
export function probeEvent(type: string): void {
  if (!active || !win) return;
  win.sse[type] = (win.sse[type] ?? 0) + 1;
}

/** Имя функции по адресу — учит клиентский fetch по заголовку ответа. */
export function probeLearnName(url: string, name: string | null): void {
  if (!name) return;
  const id = url.split("/_serverFn/")[1]?.split("?")[0];
  if (id) names.set(id, name);
}

function nameFor(url: string): string | null {
  const id = url.split("/_serverFn/")[1]?.split("?")[0];
  if (id) return names.get(id) ?? `fn#${id.slice(0, 10)}`;
  // Свои api-маршруты: картинки не считаем (их сотни и они с кэшем), поток
  // событий живёт бесконечно и в тайминги не попадает.
  const path = url.split(/[?#]/)[0];
  const m = path.match(/\/api\/([a-z0-9-]+)/i);
  if (!m || m[1] === "img" || m[1] === "beta-raid" || m[1] === "perf-client") return null;
  return `api:${m[1]}`;
}

function device(): Device {
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { effectiveType?: string };
  };
  return {
    mobile: /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent),
    dpr: Math.round((window.devicePixelRatio || 1) * 100) / 100,
    cores: nav.hardwareConcurrency ?? null,
    mem: nav.deviceMemory ?? null,
    conn: nav.connection?.effectiveType ?? null,
    screen: `${window.innerWidth}x${window.innerHeight}`,
    build: BUILD_ID.slice(0, 8),
  };
}

function readHeapInto(w: ProbeWindow): void {
  const m = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
  if (!m) return;
  const mb = m.usedJSHeapSize / 1048576;
  w.heapUsed = mb;
  w.heapPeak = Math.max(w.heapPeak ?? 0, mb);
}

function readHeap(): void {
  if (win) readHeapInto(win);
}

function flush(now: number): void {
  if (!win) return;
  const w = win;
  win = emptyWindow(now, pageOpenedAt);
  if (!worthSending(w)) return;
  readHeapInto(w);
  const body = JSON.stringify(summarize(w, device(), now));
  try {
    if (!navigator.sendBeacon?.(ENDPOINT, new Blob([body], { type: "application/json" }))) {
      void fetch(ENDPOINT, {
        method: "POST",
        body,
        keepalive: true,
        headers: { "content-type": "application/json" },
      });
    }
  } catch {
    /* нет сети — следующее окно попробует снова */
  }
}

/**
 * Включить пробу на время жизни экрана. Возвращает выключатель. Повторный
 * вызов при уже включённой — no-op с тем же выключателем: экранов рейда
 * на странице один.
 */
export function startClientProbe(): () => void {
  if (typeof window === "undefined" || active) return () => {};
  active = true;
  pageOpenedAt = performance.now();
  win = emptyWindow(pageOpenedAt, pageOpenedAt);

  const observers: PerformanceObserver[] = [];
  try {
    const lt = new PerformanceObserver((list) => {
      if (!win) return;
      for (const e of list.getEntries()) win.long.push(e.duration);
    });
    lt.observe({ type: "longtask", buffered: false });
    observers.push(lt);
  } catch {
    /* Safari/вебвью без longtask — живём без него */
  }
  try {
    const ro = new PerformanceObserver((list) => {
      if (!win) return;
      for (const e of list.getEntries() as PerformanceResourceTiming[]) {
        const name = nameFor(e.name);
        if (!name) continue;
        if (win.calls.length > 2000) break;
        win.calls.push({
          name,
          ms: Math.round(e.duration),
          bytes: e.decodedBodySize || 0,
          wire: e.encodedBodySize || 0,
        });
      }
    });
    ro.observe({ type: "resource", buffered: false });
    observers.push(ro);
  } catch {
    /* нет resource timing — без вызовов */
  }

  const heapTimer = window.setInterval(readHeap, 5000);
  const sendTimer = window.setInterval(() => flush(performance.now()), SEND_EVERY_MS);
  const onHide = () => {
    if (document.visibilityState === "hidden") flush(performance.now());
  };
  document.addEventListener("visibilitychange", onHide);
  window.addEventListener("pagehide", onHide);

  return () => {
    flush(performance.now());
    active = false;
    win = null;
    for (const o of observers) o.disconnect();
    window.clearInterval(heapTimer);
    window.clearInterval(sendTimer);
    document.removeEventListener("visibilitychange", onHide);
    window.removeEventListener("pagehide", onHide);
  };
}
