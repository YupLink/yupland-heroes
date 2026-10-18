// Сторож скорости: сервер сам замечает, что просел, и говорит об этом.
//
// Смысл в одной фразе владельца: «после каждой правки или нового босса это
// ложится как долгая прогрузка каждого хода». Просадку почти всегда приносит
// обычная работа — новый объект на карте, лишний JOIN, забытый индекс, — и
// узнают о ней последними: сначала играет игрок, потом жалуется, потом кто-то
// меряет. Сторож переворачивает порядок: замеры уже есть (perf/trace), он их
// читает и сам поднимает руку.
//
// Что он делает и чего НЕ делает. Он пишет в лог сервера — там, где это
// увидит и разработчик, и владелец через docker logs. Он не чинит ничего сам:
// автоматически лезть в живую базу с индексами и настройками — это ремонт
// вслепую, и цена ошибки выше цены просадки. Его дело — назвать виновника
// поимённо, вместе с худшими случаями.
import { perfSnapshot, type PerfRow } from "./trace";

/** Пороги: выше этого операция считается просевшей (по девяносто пятому). */
const LIMITS: Array<{ match: RegExp; p95: number }> = [
  { match: /^рейд: шаг$/, p95: 1200 },
  { match: /^бд: очередь$/, p95: 300 },
  { match: /^бд: запрос$/, p95: 800 },
];
/** Всё остальное — общий порог: операция игрока не должна тянуться дольше. */
const DEFAULT_P95 = 2000;
/** Реже одного раза в этот срок про одно и то же имя не напоминаем. */
const REPEAT_MS = 30 * 60_000;
/** Пока замеров мало, «девяносто пятый» — это просто самый неудачный случай. */
const MIN_SAMPLES = 20;

const CHECK_EVERY_MS = 10 * 60_000;

const told = new Map<string, number>();
let timer: ReturnType<typeof setInterval> | null = null;

function limitFor(name: string): number {
  return LIMITS.find((l) => l.match.test(name))?.p95 ?? DEFAULT_P95;
}

/** Просевшие операции — те, у кого девяносто пятый выше своего порога. */
export function sagging(rows: PerfRow[]): Array<{ row: PerfRow; limit: number }> {
  return rows
    .filter((r) => r.n >= MIN_SAMPLES && r.p95 > limitFor(r.name))
    .map((r) => ({ row: r, limit: limitFor(r.name) }))
    .sort((a, b) => b.row.p95 - a.row.p95);
}

function report(): void {
  const now = Date.now();
  for (const { row, limit } of sagging(perfSnapshot().rows)) {
    const last = told.get(row.name) ?? 0;
    if (now - last < REPEAT_MS) continue;
    told.set(row.name, now);
    const worst = row.slow.slice(-2).map((s) => `${s.ms} мс${s.note ? ` (${s.note})` : ""}`);
    console.warn(
      `[скорость] «${row.name}» просела: 95% дольше ${row.p95} мс при пороге ${limit} мс,` +
        ` медиана ${row.p50} мс, худшее ${row.max} мс, замеров ${row.n}` +
        (worst.length ? ` · последние тяжёлые: ${worst.join("; ")}` : ""),
    );
  }
}

/**
 * Включить сторожа. Зовётся из живущего процесса один раз; таймер не держит
 * процесс живым (unref), как и прогрев моста к базе.
 */
export function startPerfWatchdog(): void {
  if (timer || typeof setInterval !== "function") return;
  // Только сервер: снимки и задержка цикла тянут node-модули.
  if (!import.meta.env.SSR) return;
  timer = setInterval(report, CHECK_EVERY_MS);
  (timer as unknown as { unref?: () => void }).unref?.();
  // Снимки счётчиков по воркерам — тем же ленивым включением: сторож живёт
  // только на сервере, и писатель снимков заводится вместе с ним.
  void import("./snapshots").then((m) => m.startPerfSnapshots()).catch(() => {});
  // Задержка цикла событий — мастеру процессов и в отчёт.
  void import("./lagReporter").then((m) => m.startLagReporter()).catch(() => {});
}
