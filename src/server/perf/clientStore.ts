// Пробы с клиентов: приём в базу и сводка «как игрокам на самом деле».
//
// Сервер быстрый — а телефон? Ответ живёт только на устройстве игрока: время
// кадра, длинные задачи, куча, сколько байт и за сколько приехала карта. Пробы
// (lib/perf/clientProbe) шлют это раз в минуту, здесь они складываются и
// сворачиваются в квантили по окну. Данные короткоживущие (48 часов).
import { mcpExec } from "../db/mcpClient";
import { sqlStr } from "../api/raid-shared";
import { ensurePerfSchema } from "./perfSchema";
import type { ClientSample } from "@/lib/perf/probeTypes";

export async function saveClientSample(
  wallet: string,
  ua: string | null,
  sample: ClientSample,
): Promise<void> {
  await ensurePerfSchema();
  await mcpExec(
    `INSERT INTO yuplink.perf_client (wallet, mobile, ua, sample)
     VALUES (${sqlStr(wallet)}, ${sample.mobile === true}, ${ua ? sqlStr(ua.slice(0, 200)) : "NULL"},
             ${sqlStr(JSON.stringify(sample))}::jsonb);`,
    { wrapJson: false },
  );
}

export type ClientSummary = {
  hours: number;
  samples: number;
  sessions: number;
  mobileShare: number;
  /** Кадры при движении: медиана p95-кадра по пробам, худший кадр, клеток. */
  frames: Array<{
    device: "mobile" | "desktop";
    samples: number;
    p95_median: number;
    p95_worst: number;
    max: number;
    cells_median: number;
    cells_max: number;
    /** Долгих задач в минуту и их суммарная доля времени, %. */
    long_per_min: number;
    long_share_pct: number;
    heap_peak_p95: number | null;
  }>;
  /** Серверные вызовы глазами клиентов: кто чаще, кто тяжелее, кто дольше. */
  fn: Array<{
    name: string;
    calls: number;
    p50_median: number;
    max: number;
    mb_total: number;
    kb_per_call: number;
    wire_mb: number;
  }>;
  /** Событий SSE в минуту на одного клиента, по типам. */
  sse_per_client_min: Record<string, number>;
  /** Худшие сессии по кадрам (телефон), чтобы смотреть конкретное железо. */
  worst: Array<{
    at: string;
    wallet: string;
    ua: string | null;
    p95: number;
    long_total: number;
    heap_peak: number | null;
    cells_max: number;
    conn: string | null;
  }>;
};

const num = (v: unknown): number => (v == null ? 0 : Number(v) || 0);

export async function clientSummary(hours: number): Promise<ClientSummary> {
  await ensurePerfSchema();
  const h = Math.max(1, Math.min(48, Math.floor(hours)));
  const win = `at > now() - interval '${h} hours'`;
  const [tot, frames, fn, sse, worst] = await Promise.all([
    mcpExec(
      `SELECT count(*) AS samples, count(DISTINCT wallet) AS sessions,
              avg(CASE WHEN mobile THEN 1 ELSE 0 END) AS mobile_share
         FROM yuplink.perf_client WHERE ${win};`,
      { wrapJson: true },
    ),
    mcpExec(
      `SELECT mobile,
              count(*) AS samples,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY (sample->'frames'->>'p95')::numeric) AS p95_median,
              percentile_cont(0.95) WITHIN GROUP (ORDER BY (sample->'frames'->>'p95')::numeric) AS p95_worst,
              max((sample->'frames'->>'max')::numeric) AS mx,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY (sample->'frames'->>'cells_p50')::numeric) AS cells_median,
              max((sample->'frames'->>'cells_max')::numeric) AS cells_max,
              sum((sample->'long'->>'n')::numeric) / GREATEST(sum((sample->>'dur')::numeric) / 60000, 0.1) AS long_per_min,
              100 * sum((sample->'long'->>'total')::numeric) / GREATEST(sum((sample->>'dur')::numeric), 1) AS long_share,
              percentile_cont(0.95) WITHIN GROUP (ORDER BY (sample->'heap'->>'peak')::numeric) AS heap_p95
         FROM yuplink.perf_client
        WHERE ${win} AND (sample->'frames'->>'moving')::numeric > 0
        GROUP BY mobile;`,
      { wrapJson: true },
    ),
    mcpExec(
      `SELECT f.key AS name,
              sum((f.value->>'n')::numeric) AS calls,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY (f.value->>'p50')::numeric) AS p50_median,
              max((f.value->>'max')::numeric) AS mx,
              sum((f.value->>'bytes')::numeric) AS bytes,
              sum(COALESCE((f.value->>'wire')::numeric, 0)) AS wire
         FROM yuplink.perf_client c, jsonb_each(c.sample->'fn') f
        WHERE ${win}
        GROUP BY f.key ORDER BY bytes DESC LIMIT 30;`,
      { wrapJson: true },
    ),
    mcpExec(
      `SELECT e.key AS type, sum((e.value)::numeric) AS n,
              sum((c.sample->>'dur')::numeric) / 60000 AS minutes
         FROM yuplink.perf_client c, jsonb_each_text(c.sample->'sse') e
        WHERE ${win} GROUP BY e.key;`,
      { wrapJson: true },
    ),
    mcpExec(
      `SELECT to_char(at, 'MM-DD HH24:MI') AS at, wallet, ua,
              (sample->'frames'->>'p95')::numeric AS p95,
              (sample->'long'->>'total')::numeric AS long_total,
              (sample->'heap'->>'peak')::numeric AS heap_peak,
              (sample->'frames'->>'cells_max')::numeric AS cells_max,
              sample->>'conn' AS conn
         FROM yuplink.perf_client
        WHERE ${win} AND mobile AND (sample->'frames'->>'moving')::numeric > 5
        ORDER BY (sample->'frames'->>'p95')::numeric DESC LIMIT 10;`,
      { wrapJson: true },
    ),
  ]);
  const t = (tot as Array<Record<string, unknown>>)?.[0] ?? {};
  const minutesByType = new Map<string, { n: number; minutes: number }>();
  for (const r of (sse as Array<Record<string, unknown>>) ?? []) {
    minutesByType.set(String(r.type), { n: num(r.n), minutes: num(r.minutes) });
  }
  const ssePerMin: Record<string, number> = {};
  for (const [k, v] of minutesByType)
    ssePerMin[k] = Math.round((v.n / Math.max(v.minutes, 0.1)) * 10) / 10;
  return {
    hours: h,
    samples: num(t.samples),
    sessions: num(t.sessions),
    mobileShare: Math.round(num(t.mobile_share) * 100),
    frames: ((frames as Array<Record<string, unknown>>) ?? []).map((r) => ({
      device: r.mobile ? "mobile" : "desktop",
      samples: num(r.samples),
      p95_median: Math.round(num(r.p95_median) * 10) / 10,
      p95_worst: Math.round(num(r.p95_worst) * 10) / 10,
      max: Math.round(num(r.mx)),
      cells_median: Math.round(num(r.cells_median)),
      cells_max: Math.round(num(r.cells_max)),
      long_per_min: Math.round(num(r.long_per_min) * 10) / 10,
      long_share_pct: Math.round(num(r.long_share) * 10) / 10,
      heap_peak_p95: r.heap_p95 == null ? null : Math.round(num(r.heap_p95)),
    })),
    fn: ((fn as Array<Record<string, unknown>>) ?? []).map((r) => ({
      name: String(r.name),
      calls: num(r.calls),
      p50_median: Math.round(num(r.p50_median)),
      max: Math.round(num(r.mx)),
      mb_total: Math.round((num(r.bytes) / 1048576) * 10) / 10,
      kb_per_call: Math.round(num(r.bytes) / Math.max(num(r.calls), 1) / 1024),
      wire_mb: Math.round((num(r.wire) / 1048576) * 10) / 10,
    })),
    sse_per_client_min: ssePerMin,
    worst: ((worst as Array<Record<string, unknown>>) ?? []).map((r) => ({
      at: String(r.at),
      wallet: String(r.wallet),
      ua: r.ua == null ? null : String(r.ua).slice(0, 90),
      p95: Math.round(num(r.p95) * 10) / 10,
      long_total: Math.round(num(r.long_total)),
      heap_peak: r.heap_peak == null ? null : Math.round(num(r.heap_peak)),
      cells_max: Math.round(num(r.cells_max)),
      conn: r.conn == null ? null : String(r.conn),
    })),
  };
}
