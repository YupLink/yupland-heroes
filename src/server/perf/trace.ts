// Секундомер сервера: что сколько заняло и где именно было ждано.
//
// Зачем. «Ход стал долгим» — жалоба, по которой невозможно чинить: сервер
// быстрый на моей машине, база отвечает за две миллисекунды, а игрок ждёт.
// Разница живёт между ними — в очереди к мосту, в повторах после обрыва, в
// холодном кэше, который перезагружается ровно под пальцем игрока. Всё это
// видно только на бою, на живом сервере, и только если его меряют постоянно.
//
// Устройство простое: счётчики в памяти процесса, никакой записи в базу и
// никаких походов наружу. Стоимость замера — Date.now() и запись в Map.
//
// Что копим на каждое имя: сколько раз, суммарно, худшее, и распределение по
// ведрам (для медианы и «девяносто пятого»). Плюс несколько последних
// МЕДЛЕННЫХ случаев целиком — по ним видно не «в среднем плохо», а какой
// конкретно шаг куда провалился.
const MAX_SLOW = 12;

/** Границы вёдер в миллисекундах: до 5, до 10, … до 10 секунд. */
const BUCKETS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10_000];

type Agg = {
  n: number;
  total: number;
  max: number;
  errors: number;
  buckets: number[];
  slow: Array<{ ms: number; at: number; note?: string }>;
};

const stats = new Map<string, Agg>();
/** С какого момента копим — чтобы «за сколько времени» было честно. */
let since = Date.now();

function agg(name: string): Agg {
  let hit = stats.get(name);
  if (!hit) {
    hit = {
      n: 0,
      total: 0,
      max: 0,
      errors: 0,
      buckets: new Array(BUCKETS.length + 1).fill(0),
      slow: [],
    };
    stats.set(name, hit);
  }
  return hit;
}

/** Порог «медленно» для примеров: своё имя — свой порог. */
const SLOW_MS = 300;

/**
 * Ленивое включение сторожа: он живёт в том же процессе и должен завестись
 * сам, без строчки в точке входа — её пришлось бы дублировать в каждом
 * рантайме, где приложение запускается.
 */
let watchdogOn = false;
function ensureWatchdog(): void {
  if (watchdogOn) return;
  watchdogOn = true;
  // Только на сервере: клиентский бандл тянет trace через mcpClient, а сторож
  // и снимки по воркерам ходят в базу. import.meta.env.SSR — граница сборки
  // (typeof window ветку не вырезает, а импорт остаётся, см. directPg).
  if (!import.meta.env.SSR) return;
  void import("./watchdog").then((m) => m.startPerfWatchdog()).catch(() => {});
}

/** Записать состоявшийся замер. */
export function note(name: string, ms: number, opts?: { error?: boolean; note?: string }): void {
  ensureWatchdog();
  const a = agg(name);
  a.n++;
  a.total += ms;
  if (ms > a.max) a.max = ms;
  if (opts?.error) a.errors++;
  let b = BUCKETS.findIndex((edge) => ms <= edge);
  if (b < 0) b = BUCKETS.length;
  a.buckets[b]++;
  if (ms >= SLOW_MS) {
    a.slow.push({ ms: Math.round(ms), at: Date.now(), note: opts?.note });
    if (a.slow.length > MAX_SLOW) a.slow.shift();
  }
}

/**
 * Обернуть операцию секундомером. Ошибку НЕ глотает: считает её отдельно и
 * бросает дальше — иначе замер менял бы поведение кода, который меряет.
 */
export async function traced<T>(name: string, fn: () => Promise<T>, noteText?: string): Promise<T> {
  const s = Date.now();
  try {
    const out = await fn();
    note(name, Date.now() - s, { note: noteText });
    return out;
  } catch (e) {
    note(name, Date.now() - s, { error: true, note: noteText });
    throw e;
  }
}

/** Секундомер на несколько отсечек внутри одной операции. */
export function stopwatch(name: string): {
  lap(label: string): void;
  done(noteText?: string): number;
} {
  const start = Date.now();
  let last = start;
  const laps: string[] = [];
  return {
    lap(label) {
      const now = Date.now();
      laps.push(`${label} ${now - last}`);
      last = now;
    },
    done(noteText) {
      const ms = Date.now() - start;
      note(name, ms, { note: [noteText, laps.join(", ")].filter(Boolean).join(" | ") });
      return ms;
    },
  };
}

export type PerfRow = {
  name: string;
  n: number;
  avg: number;
  p50: number;
  p95: number;
  max: number;
  errors: number;
  slow: Array<{ ms: number; at: number; note?: string }>;
};

/** Оценка квантиля по ведрам: верхняя граница ведра, где он лежит. */
function quantile(a: Agg, q: number): number {
  const target = a.n * q;
  let seen = 0;
  for (let i = 0; i < a.buckets.length; i++) {
    seen += a.buckets[i];
    if (seen >= target) return i < BUCKETS.length ? BUCKETS[i] : a.max;
  }
  return a.max;
}

/** Строки отчёта из сырых счётчиков — общий код для своего процесса и слитых. */
export function rowsFromRaw(aggs: Record<string, RawAgg>): PerfRow[] {
  const rows: PerfRow[] = [];
  for (const name of Object.keys(aggs)) {
    const a = aggs[name];
    rows.push({
      name,
      n: a.n,
      avg: a.n ? Math.round(a.total / a.n) : 0,
      p50: quantile(a, 0.5),
      p95: quantile(a, 0.95),
      max: Math.round(a.max),
      errors: a.errors,
      slow: a.slow.slice(-6),
    });
  }
  rows.sort((x, y) => y.avg * y.n - x.avg * x.n);
  return rows;
}

/** Сводка по всем именам, самые дорогие сверху (по суммарному времени). */
export function perfSnapshot(): { since: number; rows: PerfRow[] } {
  return { since, rows: rowsFromRaw(perfRaw().aggs) };
}

/**
 * Сырые счётчики (с вёдрами) — чтобы слить замеры НЕСКОЛЬКИХ воркеров в одну
 * картину: приложение крутится кластером, и каждый процесс считает своё.
 * Квантили по слитым вёдрам честные, по готовым p50/p95 их не сложить.
 */
export type RawAgg = Agg;

export function perfRaw(): { since: number; aggs: Record<string, RawAgg> } {
  const aggs: Record<string, RawAgg> = {};
  for (const [name, a] of stats)
    aggs[name] = { ...a, buckets: a.buckets.slice(), slow: a.slow.slice() };
  return { since, aggs };
}

export function mergeRaw(parts: Array<Record<string, RawAgg>>): Record<string, RawAgg> {
  const out: Record<string, RawAgg> = {};
  for (const part of parts) {
    for (const name of Object.keys(part)) {
      const a = part[name];
      const hit = out[name];
      if (!hit) {
        out[name] = { ...a, buckets: a.buckets.slice(), slow: a.slow.slice() };
        continue;
      }
      hit.n += a.n;
      hit.total += a.total;
      hit.max = Math.max(hit.max, a.max);
      hit.errors += a.errors;
      for (let i = 0; i < hit.buckets.length && i < a.buckets.length; i++)
        hit.buckets[i] += a.buckets[i];
      hit.slow = [...hit.slow, ...a.slow].sort((x, y) => x.at - y.at).slice(-MAX_SLOW);
    }
  }
  return out;
}

/** Обнулить счётчики — чтобы мерить «до и после» правки. */
export function perfReset(): void {
  stats.clear();
  since = Date.now();
}
