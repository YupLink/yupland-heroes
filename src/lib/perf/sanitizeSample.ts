// Приём пробы с клиента: пересобрать чистый объект из того, что прислали.
//
// Сводка (server/perf/clientStore) считает квантили прямо в SQL по jsonb —
// `(sample->'frames'->>'p95')::numeric`, `jsonb_each(sample->'fn')`. Один
// кривой образец (строка вместо числа, массив вместо объекта) ронял бы весь
// отчёт. Поэтому в базу уходит не «что прислали», а ровно наша форма: числа
// приведены и обрезаны, лишние ключи выброшены, словари ограничены по длине.
import type { ClientSample, FnStat } from "./probeTypes";

const MAX_KEYS = 16;
const MAX_KEY_LEN = 64;

/** Конечное число в разумных пределах, иначе 0. */
function num(v: unknown, max = 1e12): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, max);
}

/** Счётчик: целое, в пределах int4 — сводка режет `::int`-совместимо. */
const cnt = (v: unknown): number => Math.floor(num(v, 2e9));

/** Короткая строка из безопасных символов: в jsonb не проедет \u0000. */
function str(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  return v.replace(/[^\w .:#/-]/g, "").slice(0, max);
}

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function key(k: string): string {
  const clean = k.replace(/[^\w.:#-]/g, "").slice(0, MAX_KEY_LEN);
  // «__proto__» и подобное — не имя функции, а подмена прототипа объекта.
  return clean.startsWith("__") ? "" : clean;
}

/** null — это не проба (нет версии или кадров), такое не сохраняем. */
export function sanitizeSample(input: unknown): ClientSample | null {
  const s = obj(input);
  if (!s || s.v !== 1) return null;
  const frames = obj(s.frames);
  if (!frames) return null;
  const long = obj(s.long) ?? {};
  const heap = obj(s.heap);
  const fn: Record<string, FnStat> = {};
  const fnIn = obj(s.fn) ?? {};
  for (const k of Object.keys(fnIn).slice(0, MAX_KEYS)) {
    const v = obj(fnIn[k]);
    const name = key(k);
    if (!v || !name) continue;
    fn[name] = {
      n: cnt(v.n),
      p50: num(v.p50),
      max: num(v.max),
      bytes: num(v.bytes),
      bytes_max: num(v.bytes_max),
      wire: num(v.wire),
    };
  }
  const sse: Record<string, number> = {};
  const sseIn = obj(s.sse) ?? {};
  for (const k of Object.keys(sseIn).slice(0, MAX_KEYS)) {
    const name = key(k);
    if (name) sse[name] = cnt(sseIn[k]);
  }
  return {
    v: 1,
    dur: Math.max(1, num(s.dur)),
    page: num(s.page),
    mobile: s.mobile === true,
    dpr: num(s.dpr, 10),
    cores: s.cores == null ? null : num(s.cores, 256),
    mem: s.mem == null ? null : num(s.mem, 1024),
    conn: str(s.conn, 16),
    screen: str(s.screen, 16) ?? "",
    frames: {
      n: cnt(frames.n),
      moving: cnt(frames.moving),
      p50: num(frames.p50),
      p95: num(frames.p95),
      max: num(frames.max),
      cells_p50: num(frames.cells_p50),
      cells_max: num(frames.cells_max),
    },
    long: { n: cnt(long.n), total: num(long.total), max: num(long.max) },
    heap: heap ? { used: num(heap.used), peak: num(heap.peak) } : null,
    fn,
    sse,
  };
}
