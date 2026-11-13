// Курс пула — игрокам, свечами 1ч / 4ч / 1д (владелец, 23.10.2026: «истории для игроков
// нет — нужен график»; «чтобы курс менялся в моменте»). С 25.10.2026 — у любого пула
// (poolId; без него — золото/DARAI, как у старого клиента). Отдельно курс не
// хранится и сбор не нужен: те же журналы и тот же проигрыш, что в статистике админа
// (bank-stats.ts → lib/bankStats.poolStats), курс после каждого события пула; новый
// обмен попадает в последнюю свечу при следующем опросе. Кто и сколько менял — здесь
// нет, только курс по времени; история обменов по-прежнему только админу.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "../../db/mcpClient";
import { requireWallet } from "../../auth";
import { poolStats, rateView, type BankEvent, type RatePoint } from "@/lib/bankStats";
import { allCandles, type Candle, type RateStep } from "@/lib/bankRate";
import type { BankPool, BankToken } from "@/lib/castleBank";
import { eventsSql, toEvent } from "./bank-stats";
import { listPools } from "./bank-pools";

export type BankRate = {
  candles: Record<RateStep, Candle[]>;
  invert: boolean;
  base: BankToken;
  quote: BankToken;
  poolId?: string;
} | null;

type History = { pool: BankPool; points: RatePoint[] };

/**
 * Банк держат открытым многие и опрашивают каждые 15 с, а рабочих процессов до
 * четырёх (обмен сбрасывает кэш только в своём). Поэтому раз в 3 с процесс сверяет
 * запас пула (одна строка bank_pool) и перечитывает журналы, только если запас
 * сдвинулся — любой обмен, наполнение или откуп его меняют. Так свежий обмен виден
 * всем через секунды, а база не читает весь журнал на каждый опрос.
 */
const FRESH_MS = 3_000;
/** Ключ — id пула; запрос без пула (старый клиент) — «золото/DARAI». */
const DEFAULT_KEY = "gold-darai";
const cache = new Map<string, { at: number; value: Promise<History | null> }>();

/** Обмен сдвинул курс: его пул и пул по умолчанию перечитаются сразу. */
export function dropRateCache(poolId?: string): void {
  if (!poolId) return cache.clear();
  cache.delete(poolId);
  cache.delete(DEFAULT_KEY);
}

const isGoldDarai = (p: BankPool) =>
  (p.tokenA === "gold" && p.tokenB === "Darai") || (p.tokenA === "Darai" && p.tokenB === "gold");
const sameReserves = (a: BankPool, b: BankPool) =>
  a.id === b.id && a.reserveA === b.reserveA && a.reserveB === b.reserveB;

async function loadHistory(key: string, prev: History | null): Promise<History | null> {
  const pools = await listPools();
  const pool = key === DEFAULT_KEY ? pools.find(isGoldDarai) : pools.find((p) => p.id === key);
  if (!pool) return null;
  if (prev && sameReserves(prev.pool, pool)) return prev;
  const rows = (await mcpExec(eventsSql(pool), { wrapJson: true })) as Parameters<
    typeof toEvent
  >[0][];
  const events = (rows ?? []).map(toEvent).filter((e): e is BankEvent => e !== null);
  // С точками наполнений: наполнение не по курсу двигает его так же, как обмен.
  return { pool, points: poolStats(pool, events, Date.now(), { fundPoints: true }).points };
}

function history(key: string): Promise<History | null> {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.at < FRESH_MS) return hit.value;
  const prev = hit ? hit.value.catch(() => null) : Promise.resolve(null);
  const value = prev.then((p) => loadHistory(key, p));
  cache.set(key, { at: now, value });
  // Ошибка базы не застревает в кэше: следующий опрос спросит заново.
  value.catch(() => {
    if (cache.get(key)?.value === value) cache.delete(key);
  });
  return value;
}

/** Сдвиг местного времени игрока от UTC в минутах (Москва — 180): границы 4ч и 1д. */
const inputSchema = z.object({
  tz: z.number().int().min(-720).max(840),
  poolId: z
    .string()
    .regex(/^[A-Za-z0-9_]{3,40}$/)
    .optional(),
});

export const getBankRate = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => inputSchema.parse(d))
  .handler(async ({ data }): Promise<BankRate> => {
    requireWallet();
    const h = await history(data.poolId ?? DEFAULT_KEY);
    if (!h || h.points.length === 0) return null;
    return {
      candles: allCandles(h.points, Date.now(), data.tz * 60_000),
      ...rateView(h.pool),
      poolId: h.pool.id,
    };
  });
