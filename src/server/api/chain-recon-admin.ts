// Вкладка «$ Экономика → Блокчейн» (сверка индексатора, server/chain/recon): последний
// прогон, история за двое суток, открытые расхождения и сколько решено за неделю. Только админ.
import { createServerFn } from "@tanstack/react-start";
import { requireAdmin } from "@/server/auth";
import { mcpExec } from "@/server/db/mcpClient";

type Scalar = string | number | boolean | null;

export type ChainIssueView = {
  id: string;
  kind: string;
  severity: "alarm" | "warn" | "info";
  key: string;
  detail: Record<string, Scalar>;
  firstSeen: string;
  notified: boolean;
};

export type ChainStatsView = {
  since: string;
  deposits: Record<string, number>;
  payouts: Record<string, number>;
  nft: Record<string, number>;
  health: {
    ok_at: string | null;
    err: string | null;
    polls: number;
    errors: number;
    rate_limited: number;
  } | null;
  day: { errors: number; rateLimited: number; polls: number } | null;
  open: number;
};

export type ChainReconView = {
  at: string | null;
  stats: ChainStatsView | null;
  history: Array<{ at: string; open: number; errors: number; rateLimited: number }>;
  open: ChainIssueView[];
  resolved7d: number;
};

const parse = <T>(v: unknown): T => (typeof v === "string" ? (JSON.parse(v) as T) : (v as T));

export const adminChainRecon = createServerFn({ method: "GET" }).handler(
  async (): Promise<ChainReconView> => {
    requireAdmin();
    const rows = (await mcpExec(
      `SELECT
         (SELECT jsonb_build_object('at', at, 'stats', stats) FROM yuplink.chain_recon_run ORDER BY at DESC LIMIT 1) AS last,
         (SELECT COALESCE(jsonb_agg(jsonb_build_object('at', at, 'open', COALESCE((stats->>'open')::int, 0),
                   'errors', COALESCE((stats->'day'->>'errors')::int, 0),
                   'rateLimited', COALESCE((stats->'day'->>'rateLimited')::int, 0)) ORDER BY at DESC), '[]'::jsonb)
            FROM (SELECT at, stats FROM yuplink.chain_recon_run WHERE at > now() - interval '48 hours'
                   ORDER BY at DESC LIMIT 288) r) AS history,
         (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'severity', severity, 'key', key,
                   'detail', detail, 'firstSeen', first_seen, 'notified', notified_at IS NOT NULL)
                   ORDER BY (severity = 'alarm') DESC, first_seen DESC), '[]'::jsonb)
            FROM (SELECT * FROM yuplink.chain_recon_issue WHERE resolved_at IS NULL ORDER BY first_seen DESC LIMIT 200) i) AS open,
         (SELECT count(*) FROM yuplink.chain_recon_issue WHERE resolved_at > now() - interval '7 days')::int AS resolved7d`,
      { wrapJson: true },
    )) as Array<{ last: unknown; history: unknown; open: unknown; resolved7d: number }> | null;
    const r = rows?.[0];
    const last = r?.last ? parse<{ at: string; stats: unknown }>(r.last) : null;
    return {
      at: last?.at ?? null,
      stats: last ? parse<ChainStatsView>(last.stats) : null,
      history: r?.history ? parse<ChainReconView["history"]>(r.history) : [],
      open: r?.open ? parse<ChainIssueView[]>(r.open) : [],
      resolved7d: Number(r?.resolved7d ?? 0),
    };
  },
);
