// Плагин Nitro: выполняется при старте серверного процесса, ДО первого
// запроса. Всё остальное на сервере ленивое (грузится с первым запросом), а
// мастеру процессов (scripts/cluster-master.mjs) задержка цикла нужна с
// первой секунды жизни рабочего — иначе только что поднятый запасной молчит,
// пока до него не долетит запрос, и мастер не знает, жив ли он.
//
// Ещё — архив файлов сборки (assetArchive). Нарочно НЕ трогает perf-модули
// (trace/watchdog/snapshots): у окружения
// nitro свой экземпляр этих модулей, отдельный от ssr, и его сторож писал бы
// в отчёт второго «рабочего»-призрака с пустыми счётчиками. Здесь — только
// сообщение мастеру, тем же форматом, что шлёт perf/lagReporter.
export default function boot(): void {
  if (typeof process === "undefined" || !process.versions?.node) return;
  // Файлы этой сборки — в архив прошлых (server/assetArchive): старые страницы игроков
  // после выката продолжают получать свои куски кода. Фоном, старт не ждёт.
  void import("../assetArchive")
    .then((m) => m.archiveBuildAssets())
    .then((r) => {
      if (r.copied) console.log(`[assets] в архив: ${r.copied}, убрано старых: ${r.pruned}`);
    })
    .catch(() => {});
  if (typeof process.send !== "function") return;
  const spec = "node:perf_hooks";
  void import(/* @vite-ignore */ spec)
    .then((m: typeof import("node:perf_hooks")) => {
      const h = m.monitorEventLoopDelay({ resolution: 20 });
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
        // Мастер гасит рабочего (простой 5 мин): пока тот дорабатывает открытые
        // соединения, канал уже закрыт. Без проверки и колбэка ошибка отправки
        // летела в uncaughtException дважды в секунду (лог 28.10, 50 строк).
        if (!process.connected) return;
        const msg = { type: "raid:lag", p95, mean, cpu: (c.user + c.system) / 1000 / wall };
        process.send?.(msg, undefined, undefined, () => {});
      }, 1000);
      timer.unref();
    })
    .catch(() => {
      /* без perf_hooks — мастер увидит молчание и подстрахуется */
    });
}
