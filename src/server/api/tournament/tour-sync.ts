// Подтяжка событий из журналов в очки турнира (урон, убийства, ресурсы,
// прибыль с продаж, продажа своей рыбы и выпитые свои зелья) и суточные снимки
// фарма.
//
// Идемпотентно: ref очка собран из id строки журнала ('run:<id>', 'res:<id>')
// или из номера снимка ('farm:<k>:<аккаунт>'), и PK (турнир, ref) не даст
// засчитать событие дважды — ни при перекрытии окон, ни когда два воркера
// подтягивают один турнир одновременно.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { TOUR_SOURCE, farmPlanEndMs, farmSnapshotsDue } from "@/lib/tournament/metricSources";
import { isTourMetric, type TourMetric, type TourStatus } from "@/lib/tournament/types";
import { farmSql, syncSql } from "./tour-sql";
import { syncGoldProfit } from "./tour-profit";
import { isOwnMetric, syncOwnPieces } from "@/server/api/tournament/tour-own";

/** Турнир глазами фоновой работы: что подтягивать и не пора ли финиш. */
export type TourWork = {
  id: string;
  metric: TourMetric;
  status: TourStatus;
  days: number;
  snapshots: number;
  startedMs: number | null;
  endsMs: number | null;
  /** Назначенный конец end_at (время снимков фарма); нет — от дней. */
  endAtMs?: number | null;
  /** Конец наступил (ends_at ≤ now) — пора финиш. */
  due: boolean;
  /** Выплата висит дольше 10 минут — воркер упал на середине, доделать. */
  stale: boolean;
};

type Row = {
  id: string;
  metric: string;
  status: TourStatus;
  days: number | string;
  snapshots: number | string;
  started_ms: number | string | null;
  ends_ms: number | string | null;
  end_ms?: number | string | null;
  due: boolean;
  stale: boolean;
};

const ms = (v: number | string | null): number | null =>
  v == null || !Number.isFinite(Number(v)) ? null : Number(v);

const WORK_COLS = `id, metric, status, days, snapshots,
  extract(epoch from started_at) * 1000 AS started_ms,
  extract(epoch from ends_at) * 1000 AS ends_ms,
  extract(epoch from end_at) * 1000 AS end_ms,
  (ends_at IS NOT NULL AND ends_at <= now()) AS due,
  (status = 'paying' AND finished_at < now() - interval '10 minutes') AS stale`;

function toWork(r: Row): TourWork | null {
  if (!isTourMetric(r.metric)) return null;
  return {
    id: r.id,
    metric: r.metric,
    status: r.status,
    days: Number(r.days) || 0,
    snapshots: Number(r.snapshots) || 0,
    startedMs: ms(r.started_ms),
    endsMs: ms(r.ends_ms),
    endAtMs: ms(r.end_ms ?? null),
    due: r.due === true,
    stale: r.stale === true,
  };
}

/** Идущие и выплачиваемые турниры — работа тикера. */
export async function loadActiveTours(): Promise<TourWork[]> {
  const rows = (await mcpExec(
    `SELECT ${WORK_COLS} FROM yuplink.tournament
      WHERE status IN ('running', 'paying') ORDER BY ends_at;`,
    { wrapJson: true },
  )) as Row[] | null;
  return (rows ?? []).map(toWork).filter((t): t is TourWork => !!t);
}

/** Один турнир по id (финиш, админка). */
export async function loadTourWork(id: string): Promise<TourWork | null> {
  const rows = (await mcpExec(
    `SELECT ${WORK_COLS} FROM yuplink.tournament WHERE id = ${sqlStr(id)} LIMIT 1;`,
    { wrapJson: true },
  )) as Row[] | null;
  return rows?.[0] ? toWork(rows[0]) : null;
}

/** Снимки фарма, которые уже положены и ещё не сделаны, — по порядку. */
async function farmSnapshots(t: TourWork): Promise<void> {
  if (t.startedMs == null || t.endsMs == null) return;
  const due = farmSnapshotsDue({
    startedMs: t.startedMs,
    endsMs: t.endsMs,
    nowMs: Date.now(),
    planEndMs: farmPlanEndMs({ startedMs: t.startedMs, endAtMs: t.endAtMs ?? null, days: t.days }),
  });
  for (let k = t.snapshots + 1; k <= due; k++) await mcpExec(farmSql(t.id, k));
}

/**
 * Подтянуть турнир: журнальные категории — окно журнала, фарм — снимки.
 * Живые категории (рубка, шаги, улов) пишут хуки сами — тут им делать нечего.
 */
export async function syncTournament(t: TourWork): Promise<void> {
  const source = TOUR_SOURCE[t.metric];
  if (source === "farm") return farmSnapshots(t);
  if (source === "live") return;
  if (source === "trade") return syncGoldProfit(t.id);
  if (source === "own") return isOwnMetric(t.metric) ? syncOwnPieces(t.id, t.metric) : undefined;
  const sql = syncSql(t.id, t.metric);
  if (sql) await mcpExec(sql);
}
