// Строки турнира из базы → типы контракта (types.ts): админка и плашки.
//
// Время отдаём ISO-строкой из extract(epoch): row_to_json пишет timestamptz с
// шестью знаками и смещением, и парсить такое в браузере — лотерея.
import type {
  TourAdminRow,
  TourBand,
  TourMetric,
  TourPrize,
  TourPrizeKind,
  TourStatus,
} from "@/lib/tournament/types";
import { isTourMetric } from "@/lib/tournament/types";
import { TOUR_PRIZE_KINDS } from "@/lib/tournament/prizeText";
import { parseEntryPrice } from "@/lib/tournament/entryPrice";

/**
 * Зелья «Зелий скорости» (`t` — турнир, `ci` — свой товар): из списка турнира,
 * пусто — все зелья со скоростью в бусте. Общее для подтяжки (tour-own) и имён
 * на плашке.
 */
export const POTION_PICK_SQL = `CASE WHEN jsonb_array_length(t.items) > 0
       THEN ci.id IN (SELECT jsonb_array_elements_text(t.items))
       ELSE ci.is_potion AND ci.boost @> '[{"stat": "spd"}]'::jsonb END`;

/** Колонки турнира: общие для админки и плашек. `t` — алиас tournament. */
export const TOUR_COLS = `t.id, t.name, t.metric, t.days, t.status, t.bands, t.fund_darai::float8 AS fund, t.dry,
  extract(epoch from t.created_at) * 1000 AS created_ms,
  extract(epoch from t.started_at) * 1000 AS started_ms,
  extract(epoch from t.ends_at) * 1000 AS ends_ms,
  extract(epoch from t.finished_at) * 1000 AS finished_ms,
  extract(epoch from t.start_at) * 1000 AS start_ms,
  extract(epoch from t.end_at) * 1000 AS end_ms,
  t.last_error, t.entry_price, t.items,
  CASE WHEN t.metric = 'potion_drink'
       THEN (SELECT jsonb_agg(ci.name ORDER BY ci.name) FROM yuplink.raid_custom_item ci
              WHERE ${POTION_PICK_SQL}) END AS item_names,
  (SELECT count(*) FROM yuplink.tournament_score s
    WHERE s.tournament_id = t.id AND s.score > 0)::int AS players`;

export type TourDbRow = {
  id: string;
  name: string;
  metric: string;
  days: number | string;
  status: TourStatus;
  bands: unknown;
  fund: number | string | null;
  created_ms: number | string | null;
  started_ms: number | string | null;
  ends_ms: number | string | null;
  finished_ms: number | string | null;
  players: number | string | null;
  dry?: boolean | null;
  start_ms?: number | string | null;
  end_ms?: number | string | null;
  last_error?: string | null;
  entry_price?: unknown;
  items?: unknown;
  item_names?: unknown;
};

export const isoOf = (v: number | string | null | undefined): string | null => {
  const n = Number(v);
  return v == null || !Number.isFinite(n) ? null : new Date(n).toISOString();
};

const prizeOf = (raw: unknown): TourPrize | null => {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const kind = String(p.kind ?? "") as TourPrizeKind;
  if (!TOUR_PRIZE_KINDS.includes(kind)) return null;
  const str = (v: unknown) => (v == null || v === "" ? null : String(v));
  return {
    kind,
    amount: Number(p.amount) || 0,
    refId: str(p.refId),
    title: str(p.title),
    image: str(p.image),
  };
};

/** Строки призов из jsonb: битое отбрасываем, а не роняем окно. */
export function parseBands(raw: unknown): TourBand[] {
  const list = typeof raw === "string" ? safeJson(raw) : raw;
  if (!Array.isArray(list)) return [];
  return list
    .map((b) => {
      const o = (b ?? {}) as Record<string, unknown>;
      const prizes = Array.isArray(o.prizes) ? o.prizes.map(prizeOf) : [];
      return {
        places: String(o.places ?? ""),
        prizes: prizes.filter((p): p is TourPrize => !!p),
      };
    })
    .filter((b) => b.places !== "");
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/** Список строк из jsonb (id товаров, имена): не строки и пустые — мимо. */
export function parseStrList(raw: unknown): string[] {
  const list = typeof raw === "string" ? safeJson(raw) : raw;
  if (!Array.isArray(list)) return [];
  return list.map((v) => (typeof v === "string" ? v.trim() : "")).filter(Boolean);
}

export function metricOf(m: string): TourMetric {
  return isTourMetric(m) ? m : "damage";
}

export function toAdminRow(r: TourDbRow): TourAdminRow {
  return {
    id: r.id,
    name: r.name,
    metric: metricOf(r.metric),
    days: Number(r.days) || 0,
    status: r.status,
    bands: parseBands(r.bands),
    fundDarai: Number(r.fund) || 0,
    createdAt: isoOf(r.created_ms) ?? new Date(0).toISOString(),
    startedAt: isoOf(r.started_ms),
    endsAt: isoOf(r.ends_ms),
    finishedAt: isoOf(r.finished_ms),
    players: Number(r.players) || 0,
    dry: r.dry !== false,
    startAt: isoOf(r.start_ms),
    endAt: isoOf(r.end_ms),
    lastError: r.last_error || null,
    entryPrice: parseEntryPrice(r.entry_price),
    items: parseStrList(r.items),
  };
}
