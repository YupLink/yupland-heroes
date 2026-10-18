// Учёт смен героя в таверне: сколько зарядов осталось и когда вернётся заряд.
//
// Заряды — у КАЖДОЙ таверны свои (владелец, 02.10.2026, задача «Починить
// подсчёт таверн»: «каждая таверна должна считаться отдельно, а не как все
// вместе»). Раньше лимит был общий на аккаунт: сменил героя в одном трактире —
// и все остальные на карте стояли закрытыми. Теперь в журнал пишется клетка
// таверны, и считаются только смены в ней. Аккаунт — по-прежнему все
// sister-кошельки сразу: сосед-кошелёк не даёт второй заряд в том же трактире.
//
// Заявку пишем в лог ДО смены и оплаты: две одновременные смены иначе обе
// прошли бы проверку «заряд есть» и потратили один заряд дважды. Проигравшая
// заявка снимается сама (releaseSwap), и лог остаётся честным.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { swapState, type SwapLimit, type SwapState } from "@/lib/hero/heroSwapLimit";

/** Ключ отказа для игрока: humanError переведёт его на язык интерфейса. */
export const NO_SWAPS_KEY = "braid.tavern_no_swaps";

/** Клетка таверны: по ней журнал отличает один трактир от другого. */
export type TavernCell = { mapId: string; q: number; r: number };

const toMs = (raw: unknown): number => new Date(String(raw)).getTime();

/** Условие «смена в этой таверне». Строки до 02.10 без клетки не считаются нигде. */
const cellSql = (c: TavernCell): string =>
  `map_id = ${sqlStr(c.mapId)} AND q = ${Math.trunc(c.q)} AND r = ${Math.trunc(c.r)}`;

/** Времена свежих смен аккаунта в этой таверне, мс. Старше срока возврата не берём. */
async function freshSwaps(
  walletSql: string,
  cell: TavernCell,
  limit: SwapLimit,
): Promise<number[]> {
  const rows = (await mcpExec(
    `SELECT at FROM yuplink.hero_swap_log
      WHERE account_id IN (${walletSql}) AND ${cellSql(cell)}
        AND at > now() - make_interval(secs => ${Math.round(limit.refillMs / 1000)})
      ORDER BY at DESC LIMIT ${Math.max(1, limit.charges) + 4};`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ at: string }>;
  return (rows ?? []).map((r) => toMs(r.at)).filter((n) => Number.isFinite(n));
}

/** Сколько смен доступно в этой таверне прямо сейчас и когда вернётся следующая. */
export async function tavernSwapState(
  walletSql: string,
  cell: TavernCell,
  limit: SwapLimit,
): Promise<SwapState> {
  return swapState(Date.now(), await freshSwaps(walletSql, cell, limit), limit);
}

export type SwapClaim = { id: number };

/**
 * Занять заряд этой таверны. Отказ — брошенный ключ NO_SWAPS_KEY.
 * Считаем записи со своим id включительно: при гонке заряд достаётся тому, чья
 * заявка легла раньше, а не отменяется у обоих.
 */
export async function claimSwap(
  walletSql: string,
  wallet: string,
  heroId: string,
  cell: TavernCell,
  limit: SwapLimit,
): Promise<SwapClaim> {
  const ins = (await mcpExec(
    `INSERT INTO yuplink.hero_swap_log (wallet, hero_id, map_id, q, r)
     VALUES (${sqlStr(wallet)}, ${sqlStr(heroId)}, ${sqlStr(cell.mapId)},
             ${Math.trunc(cell.q)}, ${Math.trunc(cell.r)}) RETURNING id;`,
    { wrapJsonCte: true },
  )) as Array<{ id: number | string }>;
  const id = Number(ins?.[0]?.id);
  if (!Number.isFinite(id)) throw new Error("Трактирщик не расслышал — повтори");

  // Сбой на пересчёте — не повод жечь заряд молча: снимаем заявку и просим
  // повторить, иначе смена бы «потратилась», не случившись.
  let used = 0;
  try {
    const cnt = (await mcpExec(
      `SELECT count(*) AS n FROM yuplink.hero_swap_log
        WHERE account_id IN (${walletSql}) AND ${cellSql(cell)} AND id <= ${id}
          AND at > now() - make_interval(secs => ${Math.round(limit.refillMs / 1000)});`,
      { wrapJson: true },
    )) as Array<{ n: number | string }>;
    used = Number(cnt?.[0]?.n) || 0;
  } catch (e) {
    await releaseSwap({ id });
    throw e;
  }
  if (used > limit.charges) {
    await releaseSwap({ id });
    throw new Error(NO_SWAPS_KEY);
  }
  return { id };
}

/** Смена не состоялась — заряд возвращаем. */
export async function releaseSwap(claim: SwapClaim | null): Promise<void> {
  if (!claim) return;
  await mcpExec(`DELETE FROM yuplink.hero_swap_log WHERE id = ${claim.id};`).catch(() => {});
}
