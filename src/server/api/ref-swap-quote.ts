// Котировка и маршрут обмена USDT → DARAI через Ref Finance.
//
// «Умный» путь: смарт-роутер Ref сам выбирает пулы (обычно USDT→wNEAR→DARAI,
// через пул на NEAR) и считает выход с учётом глубины ликвидности. Мы не
// торгуем в один пул напролом — берём готовый маршрут и транслируем его в
// формат ft_transfer_call для v2.ref-finance.near.
//
// Пул DARAI/USDT тонкий: на крупной сумме проскальзывание огромное. Поэтому
// котировка отдаёт priceImpact — клиент показывает его перед подтверждением.

export const REF_CONTRACT = "v2.ref-finance.near";
export const USDT_CONTRACT = "usdt.tether-token.near";
export const USDT_DECIMALS = 6;
export const DARAI_SWAP_CONTRACT = "darai.tkn.near";
export const DARAI_SWAP_DECIMALS = 18;
const SMARTROUTER = "https://smartrouter.ref.finance/findPath";

/** Один шаг маршрута в формате Ref v2 swap. pool_id — число (u64 в контракте). */
export type RefAction = {
  pool_id: number;
  token_in: string;
  token_out: string;
  amount_in?: string;
  min_amount_out: string;
};

export type SwapQuote = {
  usdtHuman: number;
  usdtRaw: string;
  daraiOutHuman: number;
  daraiOutRaw: string;
  /** DARAI за 1 USDT по этому маршруту (с учётом проскальзывания). */
  rate: number;
  /** Спот-курс DARAI/USDT из прайс-фида Ref (для сравнения). */
  spotRate: number | null;
  /** Проскальзывание к споту, доля (0.1 = −10%). null если спот неизвестен. */
  priceImpact: number | null;
  hops: number;
  actions: RefAction[];
};

/** human → raw (целые минимальные единицы), строкой, без потери точности. */
function toRaw(human: number, decimals: number): string {
  if (!(human > 0)) return "0";
  const s = human.toFixed(Math.min(decimals, 9));
  const [i, f = ""] = s.split(".");
  const frac = (f + "0".repeat(decimals)).slice(0, decimals);
  return (i + frac).replace(/^0+(?=\d)/, "") || "0";
}

function rawToHumanNum(raw: string, decimals: number): number {
  if (!raw || raw === "0") return 0;
  const neg = raw.startsWith("-");
  const digits = (neg ? raw.slice(1) : raw).padStart(decimals + 1, "0");
  const cut = digits.length - decimals;
  const v = Number(`${digits.slice(0, cut)}.${digits.slice(cut)}`);
  return neg ? -v : v;
}

type PathPool = {
  pool_id: string | number;
  token_in: string;
  token_out: string;
  amount_in: string;
  min_amount_out: string;
};
type PathRoute = { pools: PathPool[]; amount_in: string; min_amount_out: string };
type PathResp = { routes?: PathRoute[]; amount_out?: string };

/**
 * Спросить смарт-роутер маршрут. slippage — доля (0.03 = 3%); роутер сам
 * зашивает её в min_amount_out каждого финального хопа.
 */
async function fetchPath(usdtRaw: string, slippage: number): Promise<PathResp> {
  const url =
    `${SMARTROUTER}?amountIn=${usdtRaw}&tokenIn=${USDT_CONTRACT}` +
    `&tokenOut=${DARAI_SWAP_CONTRACT}&pathDeep=3&slippage=${slippage}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Ref smart-router: HTTP ${res.status}`);
  const j = (await res.json()) as PathResp | { result_data?: PathResp };
  return (j as { result_data?: PathResp }).result_data ?? (j as PathResp);
}

/** Собрать Ref-actions из маршрута: amount_in только на первом хопе каждой ветки. */
function buildActions(routes: PathRoute[]): RefAction[] {
  const actions: RefAction[] = [];
  for (const route of routes) {
    route.pools.forEach((p, i) => {
      const a: RefAction = {
        pool_id: Number(p.pool_id),
        token_in: p.token_in,
        token_out: p.token_out,
        min_amount_out: p.min_amount_out ?? "0",
      };
      if (i === 0) a.amount_in = p.amount_in; // остальные хопы берут выход предыдущего
      actions.push(a);
    });
  }
  return actions;
}

// Спот — тот же курс, что у подписок (rate.ts: живой обмен 1 USDT → DARAI).
async function fetchSpotRate(): Promise<number | null> {
  const { fetchDaraiUsd } = await import("./energy-sub/rate");
  const p = await fetchDaraiUsd();
  return p ? 1 / p : null; // DARAI за 1 USDT
}

/**
 * Котировка обмена. Достаёт маршрут и спот-курс параллельно, считает выход и
 * проскальзывание. НЕ двигает средства — только читает.
 */
export async function quoteUsdtToDarai(usdtHuman: number, slippage = 0.03): Promise<SwapQuote> {
  if (!(usdtHuman > 0)) throw new Error("Сумма обмена должна быть больше нуля");
  const usdtRaw = toRaw(usdtHuman, USDT_DECIMALS);
  const [path, spotRate] = await Promise.all([fetchPath(usdtRaw, slippage), fetchSpotRate()]);
  const routes = path.routes ?? [];
  if (routes.length === 0) throw new Error("Ref не нашёл маршрут USDT → DARAI");
  const daraiOutRaw = String(path.amount_out ?? "0");
  const daraiOutHuman = rawToHumanNum(daraiOutRaw, DARAI_SWAP_DECIMALS);
  if (!(daraiOutHuman > 0)) throw new Error("Ref вернул нулевой выход");
  const rate = daraiOutHuman / usdtHuman;
  const priceImpact = spotRate ? Math.max(0, 1 - rate / spotRate) : null;
  const hops = Math.max(...routes.map((r) => r.pools.length));
  return {
    usdtHuman,
    usdtRaw,
    daraiOutHuman,
    daraiOutRaw,
    rate,
    spotRate,
    priceImpact,
    hops,
    actions: buildActions(routes),
  };
}

export { rawToHumanNum };
