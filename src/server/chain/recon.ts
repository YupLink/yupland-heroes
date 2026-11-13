// Прогон сверки индексатора (recon-sql) раз в 10 минут — своим таймером и своей арендой,
// отдельно от цикла опроса: застрявший или упавший индексатор так и ловится («не опрашивает
// сеть»). Расхождения живут в chain_recon_issue (пропало — решено), числа каждого прогона —
// в chain_recon_run. Новая тревога — сразу письмо админам; раз в сутки после 06:00 UTC — сводка.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { reconIssuesSql, reconStatsSql } from "./recon-sql";

export type ReconIssue = {
  kind: string;
  severity: "alarm" | "warn" | "info";
  key: string;
  detail: Record<string, unknown>;
};

type Counter = {
  polls?: number;
  errors?: number;
  rate_limited?: number;
  ok_at?: string | null;
  err?: string | null;
};
export type ReconStats = {
  since: string;
  deposits: Record<string, number>;
  payouts: Record<string, number>;
  nft: Record<string, number>;
  health: Counter | null;
  cursors: Record<string, unknown> | null;
  /** Ошибки и отказы «часто» за сутки — разница счётчиков с прогоном сутки назад. */
  day?: { errors: number; rateLimited: number; polls: number };
};

/** Индексатор молчит дольше этого — тревога. */
export const STALE_MS = 5 * 60_000;
/** Ошибок (кроме отказов «часто») в час — больше этого — предупреждение. */
export const ERRORS_PER_HOUR = 20;

const parse = <T>(v: unknown): T => (typeof v === "string" ? (JSON.parse(v) as T) : (v as T));
const num = (v: unknown) => Number(v ?? 0) || 0;

/** Здоровье — сами расхождения: «молчит» и «много ошибок». */
export function healthIssues(s: ReconStats, now: number, hourErrors: number): ReconIssue[] {
  const out: ReconIssue[] = [];
  const ok = s.health?.ok_at ? Date.parse(String(s.health.ok_at)) : NaN;
  if (!Number.isFinite(ok) || now - ok > STALE_MS)
    out.push({
      kind: "indexer_stale",
      severity: "alarm",
      key: "indexer",
      detail: { okAt: s.health?.ok_at ?? null, err: s.health?.err ?? null },
    });
  if (hourErrors > ERRORS_PER_HOUR)
    out.push({
      kind: "indexer_errors",
      severity: "warn",
      key: "indexer",
      detail: { perHour: hourErrors, err: s.health?.err ?? null },
    });
  return out;
}

const issueId = (i: ReconIssue) => `${i.kind}:${i.key}`;

/** Одно расхождение — одна строка (в транзакции бывает несколько переводов). */
export function dedupeIssues(issues: readonly ReconIssue[]): ReconIssue[] {
  const by = new Map<string, ReconIssue>();
  for (const i of issues) if (!by.has(issueId(i))) by.set(issueId(i), i);
  return [...by.values()];
}

/**
 * Текущие расхождения — в таблицу (новое или снова увиденное), ответ — строки с отметкой
 * письма. Одна команда записи без вложенных WITH: mcpExec оборачивает её в свой CTE
 * (wrapJsonCte), а вложенный WITH с записью Postgres не принимает.
 */
export function upsertIssuesSql(issues: readonly ReconIssue[]): string | null {
  const list = dedupeIssues(issues);
  if (!list.length) return null;
  const values = list
    .map(
      (i) =>
        `(${sqlStr(issueId(i))}, ${sqlStr(i.kind)}, ${sqlStr(i.severity)}, ${sqlStr(i.key)}, ${sqlStr(JSON.stringify(i.detail))}::jsonb)`,
    )
    .join(",\n       ");
  return `INSERT INTO yuplink.chain_recon_issue (id, kind, severity, key, detail) VALUES ${values}
    ON CONFLICT (id) DO UPDATE SET last_seen = now(), detail = EXCLUDED.detail,
                                   severity = EXCLUDED.severity, resolved_at = NULL
    RETURNING id, kind, severity, key, detail, notified_at`;
}

/** Пропавшие из сверки — решены (без обёртки: RETURNING не нужен). */
export function resolveIssuesSql(issues: readonly ReconIssue[]): string {
  const ids = dedupeIssues(issues).map((i) => sqlStr(issueId(i)));
  return `UPDATE yuplink.chain_recon_issue SET resolved_at = now()
     WHERE resolved_at IS NULL ${ids.length ? `AND id NOT IN (${ids.join(", ")})` : ""};`;
}

async function prevCounters(): Promise<{ hour: Counter | null; day: Counter | null }> {
  const rows = (await mcpExec(
    `SELECT (SELECT stats->'health' FROM yuplink.chain_recon_run WHERE at <= now() - interval '55 minutes' ORDER BY at DESC LIMIT 1) AS hour,
            (SELECT stats->'health' FROM yuplink.chain_recon_run WHERE at >= now() - interval '25 hours' ORDER BY at LIMIT 1) AS day`,
    { wrapJson: true },
  )) as Array<{ hour: unknown; day: unknown }> | null;
  return {
    hour: rows?.[0]?.hour ? parse<Counter>(rows[0].hour) : null,
    day: rows?.[0]?.day ? parse<Counter>(rows[0].day) : null,
  };
}

const diff = (a: Counter | null, b: Counter | null, k: keyof Counter) =>
  a && b ? Math.max(0, num(a[k]) - num(b[k])) : 0;

/** Один прогон: расхождения, числа, письма. Ответ — числа прогона. */
export async function runRecon(
  accounts: readonly string[],
  nftContracts: readonly string[],
): Promise<ReconStats> {
  const [issueRows, statRows, prev] = await Promise.all([
    mcpExec(reconIssuesSql(accounts, nftContracts), { wrapJson: true }) as Promise<
      ReconIssue[] | null
    >,
    mcpExec(reconStatsSql(accounts, nftContracts), { wrapJson: true }) as Promise<Array<{
      stats: unknown;
    }> | null>,
    prevCounters(),
  ]);
  const stats = parse<ReconStats>(statRows?.[0]?.stats);
  stats.day = {
    errors: diff(stats.health, prev.day, "errors"),
    rateLimited: diff(stats.health, prev.day, "rate_limited"),
    polls: diff(stats.health, prev.day, "polls"),
  };
  const issues = [
    ...(issueRows ?? []).map((r) => ({
      ...r,
      detail: parse<Record<string, unknown>>(r.detail) ?? {},
    })),
    ...healthIssues(stats, Date.now(), diff(stats.health, prev.hour, "errors")),
  ];
  const upsert = upsertIssuesSql(issues);
  const seen = (upsert ? await mcpExec(upsert, { wrapJsonCte: true }) : []) as Array<
    ReconIssue & { id: string; notified_at: string | null }
  > | null;
  await mcpExec(resolveIssuesSql(issues), { wrapJson: false });
  const fresh = (seen ?? []).filter((f) => f.severity === "alarm" && !f.notified_at);
  await mcpExec(
    `INSERT INTO yuplink.chain_recon_run (stats) VALUES (${sqlStr(JSON.stringify({ ...stats, open: issues.length }))}::jsonb);`,
    { wrapJson: false },
  );
  await mcpExec(`DELETE FROM yuplink.chain_recon_run WHERE at < now() - interval '30 days';`, {
    wrapJson: false,
  });
  const { notifyAlarms, notifyDaily } = await import("./recon-notify");
  if (fresh.length)
    await notifyAlarms(
      fresh.map((f) => ({ ...f, detail: parse<Record<string, unknown>>(f.detail) ?? {} })),
    );
  await notifyDaily(stats, issues.length);
  return stats;
}
