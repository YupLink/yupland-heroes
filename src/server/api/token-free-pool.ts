// Сколько токена (USDT и любого другого) свободно для раздачи.
//
// На кошельке-плательщике (darai_gdrop.near) лежит одна куча монет, но
// принадлежит она не нам целиком: часть уже обещана игрокам. При возобновлении
// карты админ раскладывает награды и должен видеть, сколько монет можно
// пообещать, не залезая в чужие деньги.
//
// Свободно = на кошельке − то, что лежит на счетах игроков − незабранные
// награды рейда − уже разложенное по живым объектам карты − заявки на вывод,
// которые ещё не ушли в сеть.
//
// Почему учитываются ВСЕ остатки счетов, а не только внесённое (как в
// darai-pools): Darai проект чеканит сам и покрывает раздачей, а USDT надо
// иметь — выведут и награду, и депозит одинаково. Здесь считаем осторожно.
//
// Заявка на вывод со счёта списывает деньги сразу (acc_withdraw_request), а
// redemption висит 'pending' до отправки: поэтому она НЕ задваивается с
// остатками счетов, но и забывать её нельзя — монеты ещё на кошельке.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "../auth";
import { mcpExec } from "../db/mcpClient";
import { sqlStr } from "./raid-shared";
import { liveRewardSql } from "./raid-reward-live";
import { pg } from "../db/pg";
import { reservedSql } from "./token-free-reserved";
import { FILLERS_SQL, AMOUNT_SQL, TEMPLATE_JOINS_SQL, TOKEN_FILLER_SQL } from "./token-fillers-sql";

export type FreeTokenPool = {
  symbol: string;
  /** Физически на кошельке-плательщике. null — сеть не ответила. */
  walletBalance: number | null;
  /** Сумма положительных остатков на счетах игроков. */
  playerBalances: number;
  /** Награды рейда, которые игроки ещё не забрали. */
  queuedRewards: number;
  /** Разложено по живым объектам карты (сундуки, монетки, боссы). */
  onMap: number;
  /** Заявки на вывод в работе: со счёта списано, в сеть не ушло. */
  payoutsPending: number;
  /** Подарки, корзины, неразыгранные ставки, незачисленные депозиты — уже чьи-то. */
  reserved: number;
  /** Что можно раскладывать. Может уйти в минус — значит уже перебор. */
  free: number | null;
};

/**
 * Одна половина подсчёта карты: клетки или беглецы.
 *
 * Слой беглецов обязателен: убежавший гриб уносит награду с собой, и без
 * него его обещание исчезло бы из счёта, пока сам объект стоит на карте.
 */
const layerSql = (symbol: string, layer: number): string => {
  const runner = layer !== 0;
  const table = runner ? "yuplink.beta_raid_runner" : "yuplink.raid_map_cells";
  const o = runner ? "rn" : "c";
  return `SELECT COALESCE(SUM(${AMOUNT_SQL}), 0) AS held
    FROM ${table} ${o}${TEMPLATE_JOINS_SQL(o)}
    LEFT JOIN yuplink.beta_raid_object_hp hp
           ON hp.map_id = ${o}.map_id AND hp.q = ${o}.q AND hp.r = ${o}.r
          AND hp.cycle_no = ${layer},
         LATERAL jsonb_array_elements(${FILLERS_SQL(o)}) f
   WHERE ${o}.object_id IS NOT NULL AND hp.killed_at IS NULL
     AND ${TOKEN_FILLER_SQL(sqlStr(symbol))}`;
};

const POOL_SQL = (symbol: string) => `
WITH per AS (
  SELECT account_id, sum(delta) AS bal
    FROM yuplink.acc_ledger WHERE token = ${sqlStr(symbol)} GROUP BY account_id),
map AS (
  SELECT COALESCE(sum(held), 0) AS held FROM (
    ${layerSql(symbol, 0)}
    UNION ALL
    ${layerSql(symbol, 1)}) layers),
queue AS (
  SELECT COALESCE(sum(reward_amount), 0) AS amt
    FROM yuplink.raid_reward
   WHERE claimed_at IS NULL AND ${liveRewardSql()} AND lower(reward_kind) = lower(${sqlStr(symbol)})),
pend AS (
  SELECT COALESCE(sum(amount), 0) AS amt
    FROM yuplink.redemptions
   WHERE status IN ('pending','processing') AND lower(reward_token) = lower(${sqlStr(symbol)}))
SELECT COALESCE((SELECT sum(GREATEST(bal, 0)) FROM per), 0)::text AS players,
       (SELECT held FROM map)::text                              AS on_map,
       (SELECT amt FROM queue)::text                             AS queued,
       (SELECT amt FROM pend)::text                              AS pending,
       ${reservedSql(symbol)}::text AS reserved;`;

/**
 * Остаток монеты на кошельке-плательщике. Тот же аккаунт, с которого уходят
 * выплаты (NEAR_SIGNER_ACCOUNT_ID), иначе «свободно» считалось бы от чужого
 * кошелька. Сеть не ответила — отдаём null: пустая клетка честнее нуля,
 * который выглядит как «денег нет».
 */
async function walletBalance(symbol: string): Promise<number | null> {
  try {
    const token = await pg.rewardTokens.findOne({ symbol });
    if (!token) return null;
    const { getOperatingBalanceRaw, rawToHuman } = await import("../near");
    const raw = await getOperatingBalanceRaw(token.ft_contract);
    return Number(rawToHuman(raw, token.decimals));
  } catch (e) {
    console.warn(
      `[token-pool] остаток ${symbol} не прочитался:`,
      e instanceof Error ? e.message : e,
    );
    return null;
  }
}

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Сколько монеты лежит на карте прямо сейчас — по живым объектам обоих слоёв.
 *
 * Отдельным запросом, чтобы этим же счётом пользовалась раскладка пула Darai:
 * там нужен ответ на вопрос «сколько из обещанного ещё стоит на карте, а не
 * ушло игрокам», и второй копии этого SQL быть не должно.
 */
export async function tokenOnMap(symbol: string, strict = false): Promise<number> {
  const q = mcpExec(
    `SELECT COALESCE(sum(held), 0)::text AS held FROM (
       ${layerSql(symbol, 0)}
       UNION ALL
       ${layerSql(symbol, 1)}) layers;`,
    { wrapJson: true },
  );
  // strict — для авторассылки: сбой не должен превращать обещанное на карте в «ноль».
  const rows = (await (strict ? q : q.catch(() => []))) as Array<{ held: string }> | null;
  if (strict && !rows?.[0]) throw new Error("Сумма на карте не прочиталась");
  return num(rows?.[0]?.held);
}

/** Все числа разом: сеть спрашиваем параллельно с базой. */
export async function freeTokenPool(symbol: string): Promise<FreeTokenPool> {
  const [rows, balance] = await Promise.all([
    mcpExec(POOL_SQL(symbol), { wrapJson: true }) as Promise<Array<Record<string, unknown>> | null>,
    walletBalance(symbol),
  ]);
  const r = rows?.[0] ?? {};
  const playerBalances = num(r.players);
  const queuedRewards = num(r.queued);
  const onMap = num(r.on_map);
  const payoutsPending = num(r.pending);
  const reserved = num(r.reserved);
  return {
    symbol,
    walletBalance: balance,
    playerBalances,
    queuedRewards,
    onMap,
    payoutsPending,
    reserved,
    free:
      balance === null
        ? null
        : balance - playerBalances - queuedRewards - onMap - payoutsPending - reserved,
  };
}

/**
 * Свободные монеты для админа. Показывается над картой, поэтому список
 * символов задаёт вызывающий: сейчас это USDT — реальные деньги, которые
 * нельзя чеканить, и раскладывать их вслепую опаснее всего.
 */
export const getFreeTokenPools = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) =>
    z.object({ symbols: z.array(z.string().min(1).max(24)).min(1).max(6) }).parse(d),
  )
  .handler(async ({ data }): Promise<FreeTokenPool[]> => {
    requireAdmin();
    return Promise.all(data.symbols.map((s) => freeTokenPool(s)));
  });
