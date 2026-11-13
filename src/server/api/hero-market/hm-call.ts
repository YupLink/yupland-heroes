// Рынок героев: вызовы SQL-функций (migrations/hero-market-01.sql; выставление —
// hero-market-03, покупка — hero-market-02) и разбор ответа.
//
// Вся работа — в функциях базы: одна транзакция на героя/покупку/снятие, замки и
// повтор по ключу там же. Здесь — только текст вызова, ключ операции и перевод
// ответа в ключи словаря (lib/translations/hero-market.ts). Текстом — чтобы тот же
// вызов проверялся тестом и на живой базе с ROLLBACK.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { LOOT_BAG_TTL_HOURS } from "@/lib/lootBag";
import { SPLIT } from "@/lib/energySub";
import {
  HERO_MARKET_FEE_PERCENT,
  HERO_MARKET_MIN_GOLD,
  type HeroMarketCurrency,
} from "@/lib/heroMarket";

/** Ответ функции: ok и поля итога либо отказ по существу (error + подстановки). */
export type HmResult = {
  ok: boolean;
  fresh?: boolean;
  error?: string;
  [k: string]: unknown;
};

const num = (v: number | null | undefined): string =>
  v == null || !Number.isFinite(v) ? "NULL" : String(v);

/** Ключ операции с клиента: буквы, цифры, «-» и «_», 8–64 знака. */
export const OP_RE = /^[A-Za-z0-9_-]{8,64}$/;

/** Ключ в базе: свой у каждого аккаунта (чужой ключ не «повторит» чужую сделку). */
export const opKey = (account: string, op: string, itemId?: string): string =>
  itemId ? `hm:${account}:${op}:${itemId}` : `hm:${account}:${op}`;

/**
 * Выставить (migrations/hero-market-03): карманы — основному по плану
 * (hm-pockets-plan), посчитанному на снимке с отпечатком seen; accept — игрок
 * согласился, что не влезшее выпадет (без него — отказ pockets_overflow).
 */
export function listCallSql(o: {
  op: string;
  account: string;
  wallet: string;
  itemId: string;
  priceGold: number | null;
  priceDarai: number | null;
  /** Основной герой, под чью ёмкость посчитан план; нет основного — null. */
  mainId: string | null;
  plan: unknown;
  seen: string;
  accept: boolean;
}): string {
  const mins = sqlStr(JSON.stringify(HERO_MARKET_MIN_GOLD));
  return `SELECT yuplink.hero_market_list(${sqlStr(o.op)}, ${sqlStr(o.account)}, ${sqlStr(o.wallet)},
    ${sqlStr(o.itemId)}, ${num(o.priceGold)}, ${num(o.priceDarai)}, ${mins}::jsonb,
    ${LOOT_BAG_TTL_HOURS}, ${o.mainId ? sqlStr(o.mainId) : "NULL"},
    ${sqlStr(JSON.stringify(o.plan ?? {}))}::jsonb, ${sqlStr(o.seen)}, ${o.accept ? "true" : "false"}) AS r`;
}

export function buyCallSql(o: {
  op: string;
  account: string;
  wallet: string;
  lotId: string;
  currency: HeroMarketCurrency;
  expect: number | null;
}): string {
  return `SELECT yuplink.hero_market_buy(${sqlStr(o.op)}, ${sqlStr(o.account)}, ${sqlStr(o.wallet)},
    ${sqlStr(o.lotId)}, ${sqlStr(o.currency)}, ${num(o.expect)}, ${HERO_MARKET_FEE_PERCENT},
    ${SPLIT.Darai.map}, ${SPLIT.Darai.burn}) AS r`;
}

export function withdrawCallSql(o: { op: string; account: string; lotId: string }): string {
  return `SELECT yuplink.hero_market_withdraw(${sqlStr(o.op)}, ${sqlStr(o.account)}, ${sqlStr(o.lotId)}) AS r`;
}

/** Выполнить вызов и достать jsonb-итог. Пустой ответ — сбой, а не «ничего». */
export async function callFn(sql: string): Promise<HmResult> {
  const rows = (await mcpExec(sql, { wrapJson: true })) as Array<{ r?: unknown }> | null;
  let r: unknown = rows?.[0]?.r;
  if (typeof r === "string") r = JSON.parse(r) as unknown;
  if (!r || typeof r !== "object") throw new Error("heromkt.failed");
  return r as HmResult;
}

/** Подстановки отказа: всё, кроме служебных полей. */
export function paramsOf(r: HmResult): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(r)) {
    if (k === "ok" || k === "error" || k === "fresh") continue;
    if (typeof v === "number" || typeof v === "string") out[k] = v;
  }
  return out;
}

/** Отказ по существу → ключ словаря (с подстановками — «ключ|{json}», как serverErrorText). */
export function refusalText(r: HmResult): string {
  const key = `heromkt.${r.error ?? "failed"}`;
  const params = paramsOf(r);
  return Object.keys(params).length ? `${key}|${JSON.stringify(params)}` : key;
}

/**
 * Исключение базы → ключ словаря. Нехватка — гард res_move/acc_move (функция сверяет
 * баланс заранее, это страховка гонки); замок/взаимная блокировка — «повтори».
 * Остальное — общий «не получилось»: в транзакции откатилось всё.
 */
export function dbErrorText(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e ?? "");
  if (/res_move: в минус/.test(raw)) return "heromkt.gold_short";
  const darai = /not_enough_currency:Darai:([\d.-]+):([\d.-]+)/.exec(raw);
  if (darai)
    return `heromkt.darai_short|${JSON.stringify({ need: Number(darai[2]), have: Math.floor(Number(darai[1])) })}`;
  if (/lock timeout|deadlock|could not obtain lock|canceling statement/i.test(raw))
    return "heromkt.busy_retry";
  if (/^heromkt\.[a-z_]+/.test(raw)) return raw;
  return "heromkt.failed";
}
