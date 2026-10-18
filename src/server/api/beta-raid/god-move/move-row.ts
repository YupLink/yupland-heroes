// Ответ переноса (режим бога): строка базы → итог для окна админа.
//
// Каждый вид переноса отвечает одной строкой row_to_json: reason (ok, already
// или причина отказа), флаги остатков на цели и счётчики переехавших строк.
// Здесь — общее: отказ, «перенесено», клетки после переноса и журнал сервера.
import {
  GOD_MOVE_LEFTOVERS,
  GOD_MOVE_REASONS,
  type GodMoveLeftover,
  type GodMoveReason,
  type GodMoveResult,
  type GodMoved,
  type GodMovedCell,
} from "@/lib/godMove";

/** Общая часть строки ответа: причина и остатки на цели. */
export type RowBase = { reason: string | null } & Partial<Record<GodMoveLeftover, boolean | null>>;

const isReason = (v: unknown): v is GodMoveReason =>
  typeof v === "string" && (GOD_MOVE_REASONS as readonly string[]).includes(v);

/**
 * Отказ из строки ответа. null — не отказ (ok или already); undefined — строки
 * нет или причина незнакома: вызывающий бросает ошибку, а не рапортует перенос,
 * которого не видел.
 */
export function refusalOf(row: RowBase | undefined): GodMoveResult | null | undefined {
  if (!row?.reason) return undefined;
  if (row.reason === "ok" || row.reason === "already") return null;
  if (!isReason(row.reason)) return undefined;
  const leftovers = GOD_MOVE_LEFTOVERS.filter((k) => row[k] === true);
  return { ok: false, reason: row.reason, leftovers };
}

/** «Перенесено» (или повтор — «уже там»). */
export const doneOf = (row: RowBase, moved: GodMoved): GodMoveResult => ({
  ok: true,
  already: row.reason === "already",
  moved,
});

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

const num = (v: unknown): number | null => {
  const n = Number(v);
  return v === null || v === undefined || !Number.isFinite(n) ? null : n;
};

type CellJson = {
  q?: unknown;
  r?: unknown;
  b?: unknown;
  s?: unknown;
  d?: unknown;
  g?: unknown;
  k?: unknown;
};

/**
 * Клетки после переноса (RETURNING записи клеток). Тир — у клетки, где теперь
 * стоит постройка (в единице она одна).
 */
export function parseCells(raw: unknown, tier: unknown): GodMovedCell[] {
  const list = (Array.isArray(raw) ? raw : []) as CellJson[];
  const t = Math.max(0, Math.trunc(num(tier) ?? 0));
  return list.map((c) => {
    const buildingId = str(c.b);
    return {
      q: Math.trunc(Number(c.q)),
      r: Math.trunc(Number(c.r)),
      buildingId,
      skinId: str(c.s),
      tier: buildingId ? t : 0,
      decorationId: str(c.d),
      groupId: str(c.g),
      iconScale: num(c.k),
    };
  });
}

/** Сколько строк переехало по подзапросам — для журнала сервера (без нулей). */
export function movedCounts(
  row: Record<string, unknown> | undefined,
  names: readonly string[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const n of names) {
    const v = Number(row?.[n] ?? 0);
    if (v > 0) out[n] = v;
  }
  return out;
}
