// Мастер процессов игры: один рабочий, запасные — только под перегрузку.
//
// Зачем свой, а не штатный node-cluster из Nitro: тот умеет лишь «поднять N
// штук навсегда». Здесь — один процесс делает всё; если его цикл событий
// начинает запаздывать (p95 задержки выше порога дольше LAG_UP_SECS), мастер
// поднимает второй (третий, четвёртый — до RAID_MAX_WORKERS); когда все
// давно простаивают — гасит лишний, оставляя минимум. Упавший поднимается
// заново. Соединения между живыми рабочими раздаёт сам Node (cluster,
// round-robin) — так «второй берёт часть очереди, первый — остальное».
//
// Рабочий — штатный worker.mjs Nitro (слушает с exclusive:false, т.е. через
// мастер). Задержку цикла он шлёт сам (src/server/perf/lagReporter.ts) раз в
// секунду по IPC: { type: "raid:lag", p95, mean, cpu }.
//
// Молчание рабочего — тоже сигнал: если он отчитывался и замолчал дольше
// STALE_MS, его цикл событий стоит (заблокирован тяжёлой работой) — считаем
// перегруженным. Если не отчитывался никогда и живёт дольше минуты — до него
// не долетает ни одного запроса, то есть он простаивает.
//
// Настройки — переменными окружения (docker-compose):
//   RAID_MIN_WORKERS=1  RAID_MAX_WORKERS=2  RAID_LAG_UP_MS=150
//   RAID_LAG_UP_SECS=10 RAID_IDLE_DOWN_MIN=5 RAID_IDLE_LAG_MS=60
// Предел в пике — ещё и scripts/cluster.json (YupLink): берётся большее.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readClusterFile, resolveMaxWorkers } from "./cluster-config.mjs";
import { installRollingReload } from "./cluster-reload.mjs";

// Для прогона логики без настоящих процессов: модуль-подмена cluster (тесты).
const cluster = process.env.RAID_CLUSTER_FAKE
  ? (await import(process.env.RAID_CLUSTER_FAKE)).default
  : (await import("node:cluster")).default;

const num = (k, d) => {
  const v = Number.parseInt(process.env[k] ?? "", 10);
  return Number.isFinite(v) && v > 0 ? v : d;
};
const MIN = num("RAID_MIN_WORKERS", 1);
const clusterFile = readClusterFile(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "cluster.json"));
const MAX = resolveMaxWorkers({ min: MIN, envMax: num("RAID_MAX_WORKERS", 2), fileMax: clusterFile.maxWorkers });
const LAG_UP_MS = num("RAID_LAG_UP_MS", 150);
const LAG_UP_SECS = num("RAID_LAG_UP_SECS", 10);
const IDLE_DOWN_MS = num("RAID_IDLE_DOWN_MIN", 5) * 60_000;
// Порог простоя 60 мс: в покое p95 задержки цикла и так 20–50 мс (шаг таймера 20 мс).
const IDLE_LAG_MS = num("RAID_IDLE_LAG_MS", 60);
/** Между двумя решениями «поднять ещё» — чтобы новый успел прогреться. */
const SCALE_COOLDOWN_MS = 30_000;
/** Отчёт старше этого — рабочий молчит: цикл событий стоит. */
const STALE_MS = 5_000;
/** Ни одного отчёта за столько — запросов до рабочего не доходит, он простаивает. */
const SILENT_IDLE_MS = 60_000;
/** Отчитывался и замолчал на столько — завис: заменяем целиком. */
const STUCK_MS = 60_000;

const here = path.dirname(fileURLToPath(import.meta.url));
const exec = process.env.RAID_WORKER_ENTRY ?? path.resolve(here, "..", ".output", "server", "worker.mjs");

const log = (msg) => console.log(`[cluster ${new Date().toISOString()}] ${msg}`);

/** id → { worker, lag: { p95, mean, cpu, at }, since } */
const workers = new Map();
let nextId = 1;
let overloadedSince = 0;
let lastScaleAt = 0;
let idleSince = Date.now();
let stopping = false;

function fork(reason) {
  const id = nextId++;
  const worker = cluster.fork({ WORKER_ID: String(id), RAID_CLUSTER: "adaptive" });
  workers.set(worker.id, { worker, id, lag: null, since: Date.now(), window: [], cold: [] });
  worker.on("message", (m) => {
    if (m && m.type === "raid:lag") {
      const w = workers.get(worker.id);
      if (!w) return;
      w.lag = { p95: Number(m.p95) || 0, mean: Number(m.mean) || 0, cpu: Number(m.cpu) || 0, at: Date.now() };
      // Окно последних отчётов: перегрузка — когда высоко БОЛЬШИНСТВО секунд,
      // а не каждая подряд (одна тихая секунда сбрасывала бы счёт). Горячая
      // секунда — задержка цикла выше порога ИЛИ процесс съел ядро целиком:
      // при потоке мелких запросов цикл запаздывает всего на 70–100 мс, а
      // ядро уже занято (замер 1000 сессий: cpu 1,5–1,8 при p95 75–100 мс).
      w.window.push(w.lag.p95 > LAG_UP_MS || w.lag.cpu > CPU_HOT ? 1 : 0);
      if (w.window.length > WINDOW) w.window.shift();
      // То же для простоя: холодная секунда — цикл не запаздывает и ядро
      // свободно; одна шумная секунда за пять минут не должна сбрасывать отсчёт.
      w.cold.push(w.lag.p95 < IDLE_LAG_MS && w.lag.cpu < 0.3 ? 1 : 0);
      if (w.cold.length > WINDOW) w.cold.shift();
    }
  });
  log(`поднят рабочий #${id} (pid ${worker.process.pid}): ${reason}; всего ${workers.size}`);
  return worker;
}

/**
 * Мягко погасить: новые соединения не принимает, свои дорабатывает.
 * Не дождались — SIGTERM (SSE-соединения живут вечно, disconnect их не ждёт),
 * не помогло и это (сервер ждёт «изящного» закрытия) — SIGKILL: зомби с
 * сотней мегабайт в контейнере хуже оборванного соединения, клиент переподключится.
 */
function retire(entry, reason) {
  log(`гашу рабочего #${entry.id}: ${reason}; останется ${workers.size - 1}`);
  workers.delete(entry.worker.id);
  try {
    entry.worker.disconnect();
  } catch {
    /* уже умер */
  }
  setTimeout(() => {
    if (!entry.worker.isDead()) entry.worker.process.kill("SIGTERM");
  }, 15_000).unref();
  setTimeout(() => {
    if (!entry.worker.isDead()) {
      log(`рабочий #${entry.id} не вышел по SIGTERM — SIGKILL`);
      entry.worker.process.kill("SIGKILL");
    }
  }, 30_000).unref();
}

cluster.setupPrimary({ exec, args: [], silent: false });

/**
 * Замена упавшего — с нарастающей паузой: рабочий, умирающий на старте,
 * иначе перезапускался бы раз в секунду, а контейнер снаружи выглядел бы
 * здоровым. Прожил минуту — пауза сбрасывается.
 */
let crashes = 0;

cluster.on("exit", (worker, code, signal) => {
  const entry = workers.get(worker.id);
  if (entry) {
    workers.delete(worker.id);
    log(`рабочий #${entry.id} умер (code ${code}, signal ${signal}); всего ${workers.size}`);
  }
  if (stopping) return;
  if (workers.size >= MIN) return;
  const now = Date.now();
  crashes = entry && now - entry.since > 60_000 ? 0 : crashes + 1;
  const delay = Math.min(30_000, 1000 * 2 ** Math.min(crashes, 5));
  setTimeout(() => {
    if (!stopping && workers.size < MIN) fork(`замена упавшего (пауза ${delay / 1000} с, падений подряд ${crashes})`);
  }, delay).unref();
});

/** Отчётов в окне и сколько из них должны быть выше порога, чтобы считать перегрузкой. */
const WINDOW = 10;
const WINDOW_HOT = 7;
/** Доля ядра, с которой секунда считается горячей (сверх 1 — потоки GC/IO). */
const CPU_HOT = 0.9;

/**
 * Задержка рабочего для решений: молчание после отчёта — бесконечность;
 * иначе — порог, если он превышен в большинстве последних секунд, или
 * последний отчёт, если нет.
 */
function lagOf(w, now) {
  if (!w.lag) return null;
  if (now - w.lag.at >= STALE_MS) return Infinity;
  const hot = w.window.reduce((a, b) => a + b, 0);
  if (w.window.length >= WINDOW && hot >= WINDOW_HOT) return Math.max(w.lag.p95, LAG_UP_MS + 1);
  return w.lag.p95;
}

function tick() {
  if (stopping) return;
  const now = Date.now();
  const live = [...workers.values()];
  let worst = 0;
  for (const w of live) {
    const lag = lagOf(w, now);
    if (lag !== null && lag > worst) worst = lag;
  }
  const overloaded = worst > LAG_UP_MS;
  if (overloaded) {
    if (!overloadedSince) overloadedSince = now;
    idleSince = now;
    // Рабочий молчит дольше минуты — он не перегружен, он завис: заменяем,
    // а не только подстраховываем вторым (иначе застрявший висел бы вечно).
    const stuck = live.find((w) => w.lag && now - w.lag.at > STUCK_MS);
    if (stuck && now - lastScaleAt > SCALE_COOLDOWN_MS) {
      lastScaleAt = now;
      overloadedSince = 0;
      retire(stuck, `молчит ${((now - stuck.lag.at) / 1000).toFixed(0)} с — завис`);
      fork("замена зависшего");
      return;
    }
    if (now - overloadedSince >= LAG_UP_SECS * 1000 && live.length < MAX && now - lastScaleAt > SCALE_COOLDOWN_MS) {
      lastScaleAt = now;
      overloadedSince = 0;
      const cpu = live.reduce((m, w) => Math.max(m, w.lag?.cpu ?? 0), 0);
      fork(
        worst === Infinity
          ? `рабочий молчит дольше ${STALE_MS / 1000} с (цикл событий стоит) ${LAG_UP_SECS} с подряд`
          : `перегрузка ${LAG_UP_SECS} с подряд: задержка цикла p95 ${worst.toFixed(0)} мс (порог ${LAG_UP_MS}), cpu ${(cpu * 100).toFixed(0)}%`,
      );
    }
    return;
  }
  overloadedSince = 0;
  const idle = (w) =>
    w.lag
      ? now - w.lag.at < STALE_MS &&
        w.cold.length >= WINDOW &&
        w.cold.reduce((a, b) => a + b, 0) >= WINDOW_HOT
      : now - w.since > SILENT_IDLE_MS;
  const allIdle = live.length > 0 && live.every(idle);
  if (!allIdle) {
    idleSince = now;
    return;
  }
  if (live.length > MIN && now - idleSince > IDLE_DOWN_MS) {
    idleSince = now;
    // Гасим самого молодого: у старшего больше прогретых кэшей.
    const youngest = live.reduce((a, b) => (a.since > b.since ? a : b));
    retire(youngest, `все рабочие простаивают ${IDLE_DOWN_MS / 60000} мин`);
  }
}

log(`рабочих от ${MIN} до ${MAX} (перегрузка — задержка цикла выше ${LAG_UP_MS} мс)`);
for (let i = 0; i < MIN; i++) fork("старт");
setInterval(tick, 1000).unref();
setInterval(() => {
  const now = Date.now();
  const s = [...workers.values()]
    .map((w) => {
      if (!w.lag) return `#${w.id} (нет данных)`;
      const age = now - w.lag.at;
      const stale = age >= STALE_MS ? ` молчит ${(age / 1000).toFixed(0)} с` : "";
      return `#${w.id} p95 ${w.lag.p95.toFixed(0)}мс cpu ${(w.lag.cpu * 100).toFixed(0)}%${stale}`;
    })
    .join(", ");
  log(`рабочих ${workers.size}/${MAX}: ${s}`);
}, 60_000).unref();

// Деплой: SIGHUP — сменить рабочих на свежую сборку без простоя (cluster-reload).
installRollingReload({ workers, fork, retire, log, isStopping: () => stopping });

for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => {
    stopping = true;
    log(`${sig}: гашу всех`);
    for (const w of workers.values()) {
      try {
        w.worker.process.kill("SIGTERM");
      } catch {
        /* */
      }
    }
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
