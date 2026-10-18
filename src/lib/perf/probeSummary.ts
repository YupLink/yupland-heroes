// Сводка окна замера в пробу (ClientSample): чистые функции, без DOM.
//
// Сборщик (clientProbe) копит сырые числа — время каждого кадра, каждую
// длинную задачу, каждый ответ сервера. Наружу уходит только это: квантили и
// суммы за окно.
import type { ClientSample, FnStat } from "./probeTypes";

export type FnCall = { name: string; ms: number; bytes: number; wire: number };

export type ProbeWindow = {
  startedAt: number;
  pageOpenedAt: number;
  frameMs: number[];
  frameCells: number[];
  movingFrames: number;
  long: number[];
  heapUsed: number | null;
  heapPeak: number | null;
  calls: FnCall[];
  sse: Record<string, number>;
};

export function emptyWindow(now: number, pageOpenedAt: number): ProbeWindow {
  return {
    startedAt: now,
    pageOpenedAt,
    frameMs: [],
    frameCells: [],
    movingFrames: 0,
    long: [],
    heapUsed: null,
    heapPeak: null,
    calls: [],
    sse: {},
  };
}

/** Квантиль по копии: массивы окна маленькие (≤ пары тысяч чисел). */
export function pct(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const s = values.slice().sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.floor(q * s.length));
  return s[i];
}

const r1 = (x: number) => Math.round(x * 10) / 10;

export type Device = {
  mobile: boolean;
  dpr: number;
  cores: number | null;
  mem: number | null;
  conn: string | null;
  screen: string;
};

/** Свернуть окно в пробу. Топ функций режем по весу: 16 имён хватает. */
export function summarize(w: ProbeWindow, device: Device, now: number): ClientSample {
  const byName = new Map<
    string,
    { ms: number[]; bytes: number; bytes_max: number; wire: number }
  >();
  for (const c of w.calls) {
    let hit = byName.get(c.name);
    if (!hit) {
      hit = { ms: [], bytes: 0, bytes_max: 0, wire: 0 };
      byName.set(c.name, hit);
    }
    hit.ms.push(c.ms);
    hit.bytes += c.bytes;
    hit.wire += c.wire;
    if (c.bytes > hit.bytes_max) hit.bytes_max = c.bytes;
  }
  const fn: Record<string, FnStat> = {};
  const names = [...byName.entries()].sort((a, b) => b[1].bytes - a[1].bytes).slice(0, 16);
  for (const [name, v] of names) {
    fn[name] = {
      n: v.ms.length,
      p50: Math.round(pct(v.ms, 0.5)),
      max: Math.round(Math.max(...v.ms)),
      bytes: v.bytes,
      bytes_max: v.bytes_max,
      wire: v.wire,
    };
  }
  return {
    v: 1,
    dur: Math.max(1, now - w.startedAt),
    page: Math.round((now - w.pageOpenedAt) / 1000),
    ...device,
    frames: {
      n: w.frameMs.length,
      moving: w.movingFrames,
      p50: r1(pct(w.frameMs, 0.5)),
      p95: r1(pct(w.frameMs, 0.95)),
      max: r1(w.frameMs.length ? Math.max(...w.frameMs) : 0),
      cells_p50: Math.round(pct(w.frameCells, 0.5)),
      cells_max: w.frameCells.length ? Math.max(...w.frameCells) : 0,
    },
    long: {
      n: w.long.length,
      total: Math.round(w.long.reduce((s, x) => s + x, 0)),
      max: Math.round(w.long.length ? Math.max(...w.long) : 0),
    },
    heap:
      w.heapUsed == null
        ? null
        : { used: Math.round(w.heapUsed), peak: Math.round(w.heapPeak ?? w.heapUsed) },
    fn,
    sse: w.sse,
  };
}

/** В окне есть что рассказать: хоть кадр, хоть вызов, хоть событие. */
export function worthSending(w: ProbeWindow): boolean {
  return w.frameMs.length > 0 || w.calls.length > 0 || w.long.length > 0;
}
