// Обход стейкинга банка (ПРАВИЛА §8.51) раз в 5 минут и ровно в 00:00 UTC, в каждом
// процессе — база не даст сделать одно дважды: золото за прошедшие сутки — раз в сутки
// для всех, в 00:00 UTC (bank_stake_accrue, migrations/bank-08);
// выводы DARAI холдеров, чей срок вышел, — в обычную очередь выплат; их комиссия
// 5 % — 30 % путём подписок (DARAI 60/15/25), 70 % на откуп золота из пула банка;
// раз в 15 минут — вклады за NFT холдеров, которые не успел завести ввод.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { moneyCtes } from "../energy-sub/money-sql";
import { runBuyback } from "./license-money";

/** Доли комиссии: 30 % как подписка, 70 % на откуп золота; сумма — ровно комиссия. */
export function splitHolderFee(fee: number): { sub: number; buyback: number } {
  const sub = Math.floor(fee * 0.3 * 1e8) / 1e8;
  return { sub, buyback: Math.round((fee - sub) * 1e8) / 1e8 };
}

/** Разложить комиссию одного выпущенного вывода (повтор — ничего: отметка booked). */
export function holderFeeSql(h: { id: string; fee: number }): string {
  const { sub, buyback } = splitHolderFee(h.fee);
  const money = moneyCtes({
    after: "hw",
    id: h.id,
    prefix: "holdfee",
    note: "комиссия вывода DARAI холдеров: 30 % как подписка",
    token: "Darai",
    amount: sub,
  });
  const bank =
    buyback > 0
      ? `, bank AS (
  INSERT INTO yuplink.bank_buyback (id, token, amount, source, ref)
  SELECT 'bb_' || hw.id, 'Darai', ${buyback.toFixed(8)}, 'holder_fee', 'holdfee:' || hw.id || ':bank' FROM hw
  ON CONFLICT (ref) DO NOTHING
  RETURNING 1
)`
      : "";
  return `
WITH hw AS (
  UPDATE yuplink.holder_withdraw SET booked = true
   WHERE id = ${sqlStr(h.id)} AND status = 'released' AND NOT booked
  RETURNING id
)${bank}${money}
SELECT row_to_json(_t.*) AS _row FROM (SELECT (SELECT count(*) FROM hw)::int AS booked) _t;`;
}

const warn = (what: string) => (e: unknown) =>
  console.warn(`[bank-stake] ${what}:`, e instanceof Error ? e.message : e);

async function releaseDue(): Promise<void> {
  const due = ((await mcpExec(
    `SELECT id FROM yuplink.holder_withdraw WHERE status = 'waiting' AND release_at <= now()
      ORDER BY release_at LIMIT 20;`,
    { wrapJson: true },
  )) ?? []) as Array<{ id: string }>;
  for (const r of due)
    await mcpExec(`SELECT yuplink.holder_withdraw_release(${sqlStr(r.id)}) AS ok;`, {
      wrapJson: true,
    });
  const unbooked = ((await mcpExec(
    `SELECT id, fee FROM yuplink.holder_withdraw WHERE status = 'released' AND NOT booked ORDER BY released_at LIMIT 20;`,
    { wrapJson: true },
  )) ?? []) as Array<{ id: string; fee: number | string }>;
  for (const r of unbooked) await mcpExec(holderFeeSql({ id: r.id, fee: Number(r.fee) }));
  if (unbooked.length > 0) await runBuyback();
}

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;
let passes = 0;
const EVERY_MS = 5 * 60_000;

export async function bankStakePass(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await mcpExec(`SELECT yuplink.bank_stake_accrue() AS n;`, { wrapJson: true }).catch(
      warn("золото"),
    );
    await releaseDue().catch(warn("выводы холдеров"));
    if (passes++ % 3 === 0) {
      const { catchUpHolderNfts } = await import("./holder-nft");
      await catchUpHolderNfts().catch(warn("NFT холдеров"));
    }
  } finally {
    running = false;
  }
}

const unref = (t: unknown) => (t as { unref?: () => void }).unref?.();

/** Мс до ближайших 00:00:05 UTC — золото дня приходит ровно в полночь, а не до 5 минут позже. */
export function msToUtcMidnight(now = Date.now()): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 5) - now;
}

function atMidnight(): void {
  unref(
    setTimeout(() => {
      void bankStakePass();
      atMidnight();
    }, msToUtcMidnight()),
  );
}

export function startBankStakeTicker(): void {
  if (timer || typeof setInterval !== "function") return;
  timer = setInterval(() => void bankStakePass(), EVERY_MS);
  unref(timer);
  atMidnight();
  void bankStakePass();
}
