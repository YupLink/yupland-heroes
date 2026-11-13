// Задержка цикла событий — мастеру процессов (scripts/cluster-master.mjs).
//
// Один процесс делает всё, и единственный честный признак «не справляюсь» —
// цикл событий начал запаздывать: запросы стоят в очереди за чьей-то долгой
// работой. Раз в секунду шлём мастеру p95/среднее задержки и долю процессора;
// он по ним поднимает второго рабочего или гасит лишнего. Без мастера
// (process.send нет) — молчим. Заодно кладём задержку в отчёт /api/perf.
import { note } from "./trace";

let started = false;

export async function startLagReporter(): Promise<void> {
  if (started || typeof process === "undefined" || !process.versions?.node) return;
  started = true;
  // Имя модуля переменной: файл попадает в анализ клиентской сборки через
  // watchdog, и статический «node:perf_hooks» ронял бы её.
  const spec = "node:perf_hooks";
  const { monitorEventLoopDelay } = (await import(
    /* @vite-ignore */ spec
  )) as typeof import("node:perf_hooks");
  const h = monitorEventLoopDelay({ resolution: 20 });
  h.enable();
  let cpu = process.cpuUsage();
  let at = Date.now();
  const timer = setInterval(() => {
    const now = Date.now();
    const wall = Math.max(1, now - at);
    const c = process.cpuUsage(cpu);
    cpu = process.cpuUsage();
    at = now;
    const p95 = h.percentile(95) / 1e6;
    const mean = h.mean / 1e6;
    h.reset();
    const cpuShare = (c.user + c.system) / 1000 / wall;
    note("цикл: задержка", p95);
    // Канал закрыт (мастер гасит рабочего) — молчим; ошибку отправки ловит колбэк,
    // иначе она уходит в uncaughtException (boot.ts — так же).
    if (typeof process.send === "function" && process.connected) {
      process.send({ type: "raid:lag", p95, mean, cpu: cpuShare }, undefined, undefined, () => {});
    }
  }, 1000);
  timer.unref();
}
