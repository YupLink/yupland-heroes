// Снимки счётчиков по воркерам — в базу, раз в минуту.
//
// Зачем. Приложение крутится кластером из нескольких процессов, а счётчики
// perf/trace живут в памяти каждого. /api/perf попадал в один случайный воркер
// и показывал четверть картины. Теперь каждый воркер раз в минуту кладёт свои
// сырые счётчики (с вёдрами) в yuplink.perf_snapshot, а отчёт берёт последний
// снимок каждого воркера и сливает вёдра — квантили по всем процессам честные.
//
// Цена: один INSERT в минуту на воркер, строка в десятки КБ. Старое чистим
// сами (снимки — 20 минут, пробы клиентов — 48 часов), крона не нужно.
// Любая ошибка глотается: отчёт — не игра.
import { mcpExec } from "../db/mcpClient";
import { sqlStr } from "../api/raid-shared";
import { perfRaw, mergeRaw, rowsFromRaw, type RawAgg, type PerfRow } from "./trace";
import { hubSnapshot, mergeHub, type HubSnapshot } from "./hubStats";
import { ensurePerfSchema } from "./perfSchema";

const EVERY_MS = 60_000;
/** Снимки читаются только последние (3 мин), история им не нужна: 20 минут. */
const KEEP_SNAPSHOT_MIN = 20;
/** Пробы с клиентов — двое суток: по ним смотрят «как было вчера». */
const KEEP_CLIENT_HOURS = 48;
const CLEAN_EVERY_MS = 5 * 60_000;
/** Метка процесса: pid + случайный хвост, чтобы перезапуск не склеился со старым. */
export const WORKER_ID = `${process.pid}-${Math.random().toString(36).slice(2, 6)}`;

type Snapshot = {
  worker: string;
  at: number;
  since: number;
  aggs: Record<string, RawAgg>;
  hub: HubSnapshot;
};

let timer: ReturnType<typeof setInterval> | null = null;
let lastCleanup = 0;

async function writeSnapshot(): Promise<void> {
  const raw = perfRaw();
  if (Object.keys(raw.aggs).length === 0) return;
  const snap: Snapshot = {
    worker: WORKER_ID,
    at: Date.now(),
    since: raw.since,
    aggs: raw.aggs,
    hub: hubSnapshot(),
  };
  await ensurePerfSchema();
  await mcpExec(
    `INSERT INTO yuplink.perf_snapshot (worker, at, data)
     VALUES (${sqlStr(WORKER_ID)}, now(), ${sqlStr(JSON.stringify(snap))}::jsonb);`,
    { wrapJson: false },
  );
  if (Date.now() - lastCleanup > CLEAN_EVERY_MS) {
    lastCleanup = Date.now();
    // По одному statement на вызов: прямой драйвер на пачке statements отдаёт
    // массив результатов, mcpExec его не понимает и уходит на мост повтором.
    await mcpExec(
      `DELETE FROM yuplink.perf_snapshot WHERE at < now() - interval '${KEEP_SNAPSHOT_MIN} minutes';`,
      { wrapJson: false },
    );
    await mcpExec(
      `DELETE FROM yuplink.perf_client WHERE at < now() - interval '${KEEP_CLIENT_HOURS} hours';`,
      { wrapJson: false },
    );
  }
}

/** Запустить писателя снимков. Таймер не держит процесс (unref). */
export function startPerfSnapshots(): void {
  if (timer || typeof setInterval !== "function") return;
  // Локальный vite dev ходит в боевую базу через мост: его снимки (запросы по
  // 5–18 с через мост) ложились в общий отчёт как «тормозит база» (14.10.2026).
  if (process.env.NODE_ENV !== "production") return;
  timer = setInterval(() => {
    void writeSnapshot().catch(() => {});
  }, EVERY_MS);
  (timer as unknown as { unref?: () => void }).unref?.();
}

/** Последний снимок каждого живого воркера (не старше трёх минут). */
async function readLatest(): Promise<Snapshot[]> {
  const rows = (await mcpExec(
    `SELECT DISTINCT ON (worker) data
       FROM yuplink.perf_snapshot
      WHERE at > now() - interval '3 minutes'
      ORDER BY worker, at DESC;`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ data: Snapshot }>;
  return (rows ?? []).map((r) => r.data).filter((d) => d && d.aggs);
}

export type ClusterReport = {
  /** Сколько воркеров прислали снимок; 0 — отчёт только по этому процессу. */
  workers: number;
  /** Самый ранний «с какого момента» среди воркеров. */
  since: number;
  rows: PerfRow[];
  hub: HubSnapshot;
  perWorker: Array<{ worker: string; at: number; listeners: number; calls: number }>;
};

/**
 * Слитая картина по всем воркерам. Свой процесс берём живьём (он свежее
 * своего же снимка минутной давности), остальные — из базы.
 */
export async function clusterReport(): Promise<ClusterReport> {
  const mine = perfRaw();
  const mineHub = hubSnapshot();
  const others = (await readLatest()).filter((s) => s.worker !== WORKER_ID);
  const aggs = mergeRaw([mine.aggs, ...others.map((s) => s.aggs)]);
  const hub = mergeHub([mineHub, ...others.map((s) => s.hub)]);
  const calls = (a: Record<string, RawAgg>) =>
    Object.keys(a)
      .filter((k) => k.startsWith("fn:"))
      .reduce((s, k) => s + a[k].n, 0);
  return {
    workers: others.length + 1,
    since: Math.min(mine.since, ...others.map((s) => s.since)),
    rows: rowsFromRaw(aggs),
    hub,
    perWorker: [
      { worker: WORKER_ID, at: Date.now(), listeners: mineHub.listeners, calls: calls(mine.aggs) },
      ...others.map((s) => ({
        worker: s.worker,
        at: s.at,
        listeners: s.hub?.listeners ?? 0,
        calls: calls(s.aggs),
      })),
    ],
  };
}
