// Статистика пулов банка — только админу (Архан, 21.10.2026; владелец: «графики и
// историю обмена — только админу»). Расчёт — lib/bankStats.ts по журналам базы:
// наполнение (bank_pool_fund), обмены (bank_swap), откуп золота (bank_buyback, done —
// только у пула «золото → DARAI», комиссия откупа целиком остаётся в пуле). История
// обменов — порциями от новых к старым, курсор «время|id».
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "../../db/mcpClient";
import { requireAdmin } from "../../auth";
import { sqlStr } from "../raid-shared";
import { displayNames } from "../beta-raid/econ/names";
import type { BankPool, BankToken } from "@/lib/castleBank";
import { poolStats, thinPoints, type BankEvent } from "@/lib/bankStats";
import { listPools } from "./bank-pools";

const poolIdSchema = z.string().regex(/^[A-Za-z0-9_]{3,40}$/);
const isToken = (t: unknown): t is BankToken => typeof t === "string" && t.length > 0;
const num = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

async function poolById(id: string): Promise<BankPool> {
  const pool = (await listPools()).find((p) => p.id === id);
  if (!pool) throw new Error("Пул не найден");
  return pool;
}

/** Откуп ходит только в пул «золото → DARAI»: у других пулов этих строк нет. */
const buybackSql = (pool: BankPool, cols: string) =>
  pool.tokenA === "gold" && pool.tokenB === "Darai"
    ? `UNION ALL SELECT ${cols} FROM yuplink.bank_buyback b WHERE b.status = 'done' AND b.done_at IS NOT NULL`
    : "";

type EventRow = {
  k: "fund" | "swap" | "buyback";
  at: string;
  ti: string | null;
  ai: number | string;
  ao: number | string;
  fp: number | string;
  fm: number | string;
};

export function toEvent(r: EventRow): BankEvent | null {
  const at = Date.parse(r.at);
  if (!Number.isFinite(at)) return null;
  if (r.k === "fund") return { kind: "fund", at, a: num(r.ai), b: num(r.ao) };
  if (!isToken(r.ti)) return null;
  return {
    kind: r.k,
    at,
    tokenIn: r.ti,
    amountIn: num(r.ai),
    amountOut: num(r.ao),
    feePool: num(r.fp),
    feeMap: num(r.fm),
  };
}

export function eventsSql(pool: BankPool): string {
  const id = sqlStr(pool.id);
  const fee = Number(pool.feePct);
  return `SELECT k, at, ti, ai, ao, fp, fm FROM (
    SELECT 'fund' AS k, f.created_at AS at, f.id, NULL::text AS ti, f.amount_a AS ai, f.amount_b AS ao,
           0::numeric AS fp, 0::numeric AS fm
      FROM yuplink.bank_pool_fund f WHERE f.pool_id = ${id}
    UNION ALL
    SELECT 'swap', s.created_at, s.id, s.token_in, s.amount_in, s.amount_out, s.fee_pool, s.fee_map
      FROM yuplink.bank_swap s WHERE s.pool_id = ${id}
    ${buybackSql(pool, `'buyback', b.done_at, b.id, 'Darai', b.amount, b.gold_out, b.amount * ${fee} / 100, 0`)}
  ) e ORDER BY at, id`;
}

export const getBankPoolStats = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ poolId: poolIdSchema }).parse(d))
  .handler(async ({ data }) => {
    requireAdmin();
    const pool = await poolById(data.poolId);
    const rows = (await mcpExec(eventsSql(pool), { wrapJson: true })) as EventRow[];
    const events = (rows ?? []).map(toEvent).filter((e): e is BankEvent => e !== null);
    const stats = poolStats(pool, events, Date.now());
    return { pool, ...stats, points: thinPoints(stats.points), pointsTotal: stats.points.length };
  });

export type BankSwapItem = {
  id: string;
  at: string;
  /** @ник игрока; у откупа банка — null. */
  who: string | null;
  buyback: boolean;
  tokenIn: BankToken;
  amountIn: number;
  tokenOut: BankToken;
  amountOut: number;
  feePool: number;
  feeMap: number;
};

type HistRow = {
  id: string;
  at: string;
  acc: string | null;
  bb: boolean;
  ti: string;
  ai: number | string;
  to: string;
  ao: number | string;
  fp: number | string;
  fm: number | string;
};

export const HISTORY_PAGE = 30;
const CURSOR_RE = /^([0-9T:.+\- ]{10,40})\|([A-Za-z0-9_:.-]{3,80})$/;

export function historySql(pool: BankPool, cursor: string | null, limit: number): string {
  const id = sqlStr(pool.id);
  const fee = Number(pool.feePct);
  const m = cursor ? CURSOR_RE.exec(cursor) : null;
  const where = m ? `WHERE (h.at, h.id) < (${sqlStr(m[1])}::timestamptz, ${sqlStr(m[2])})` : "";
  return `SELECT h.id, h.at, h.acc, h.bb, h.ti, h.ai, h."to", h.ao, h.fp, h.fm FROM (
    SELECT s.id, s.created_at AS at, s.account_id AS acc, false AS bb, s.token_in AS ti, s.amount_in AS ai,
           s.token_out AS "to", s.amount_out AS ao, s.fee_pool AS fp, s.fee_map AS fm
      FROM yuplink.bank_swap s WHERE s.pool_id = ${id}
    ${buybackSql(pool, `b.id, b.done_at, NULL, true, 'Darai', b.amount, 'gold', b.gold_out, b.amount * ${fee} / 100, 0`)}
  ) h ${where}
  ORDER BY h.at DESC, h.id DESC LIMIT ${limit + 1}`;
}

export const listBankSwapHistory = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z
      .object({ poolId: poolIdSchema, cursor: z.string().regex(CURSOR_RE).nullable().optional() })
      .parse(d),
  )
  .handler(async ({ data }) => {
    requireAdmin();
    const pool = await poolById(data.poolId);
    const rows = ((await mcpExec(historySql(pool, data.cursor ?? null, HISTORY_PAGE), {
      wrapJson: true,
    })) ?? []) as HistRow[];
    const page = rows.slice(0, HISTORY_PAGE);
    const names = await displayNames(page.map((r) => r.acc ?? "").filter(Boolean));
    const items: BankSwapItem[] = page
      .filter((r) => isToken(r.ti) && isToken(r.to))
      .map((r) => ({
        id: r.id,
        at: r.at,
        who: r.acc ? (names.get(r.acc)?.displayName ?? null) : null,
        buyback: r.bb === true,
        tokenIn: r.ti as BankToken,
        amountIn: num(r.ai),
        tokenOut: r.to as BankToken,
        amountOut: num(r.ao),
        feePool: num(r.fp),
        feeMap: num(r.fm),
      }));
    const last = page.at(-1);
    return { items, next: rows.length > HISTORY_PAGE && last ? `${last.at}|${last.id}` : null };
  });
