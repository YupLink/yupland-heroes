// Схема внутриигровых аукционов (лениво-идемпотентная). Ставки в любой валюте:
// списание/возврат — через acc_ledger. Инвариант: деньги держат только ставки,
// занимающие лот (auction_bid.active); остальные возвращены (refunded).
// Имя game-auction — чтобы не путать с on-chain auction.ts (листинг Sendler).
import { mcpExec } from "../../db/mcpClient";
import { AUCTION_FN_VERSION, AUCTION_MULTI_MIGRATIONS } from "./bid-fn";

/** Функция ставки и колонки «лоты/копии»: накатываем, только если версии нет. */
async function ensureBidFunction(): Promise<void> {
  const ver = (await mcpExec(
    `SELECT obj_description(p.oid, 'pg_proc') AS v FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'yuplink' AND p.proname = 'auction_place_bid';`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ v: string | null }>;
  if (ver?.[0]?.v === AUCTION_FN_VERSION) return;
  // Несколько рабочих процессов могут накатывать одновременно — ошибка одного
  // не страшна, если функция в итоге есть. Проверяем ниже.
  for (const sql of AUCTION_MULTI_MIGRATIONS) {
    await mcpExec(sql, { wrapJson: false }).catch((e) => console.warn("[auction] миграция:", e));
  }
  const again = (await mcpExec(
    `SELECT 1 AS ok FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'yuplink' AND p.proname = 'auction_place_bid';`,
    { wrapJson: true },
  )) as Array<{ ok: number }>;
  if (!again?.[0]) throw new Error("Аукцион: функция ставки не создана");
}

let ready = false;
export async function ensureAuctionSchema(): Promise<void> {
  if (ready) return;
  await mcpExec(
    `CREATE TABLE IF NOT EXISTS yuplink.auction (
       id text PRIMARY KEY,
       title text,
       prize_kind text NOT NULL,
       prize_ref text NOT NULL,
       prize_qty integer NOT NULL DEFAULT 1,
       currency text NOT NULL,
       start_price numeric NOT NULL,
       min_step_pct numeric NOT NULL DEFAULT 5,
       anti_snipe_min integer NOT NULL DEFAULT 5,
       start_at timestamptz NOT NULL DEFAULT now(),
       end_at timestamptz NOT NULL,
       status text NOT NULL DEFAULT 'live',
       top_account_id text,
       top_wallet text,
       top_bid numeric,
       top_bid_id text,
       top_bid_at timestamptz,
       winner_account_id text,
       prize_delivered boolean NOT NULL DEFAULT false,
       created_by text,
       created_at timestamptz DEFAULT now()
     );`,
    { wrapJson: false },
  );
  await mcpExec(
    `CREATE TABLE IF NOT EXISTS yuplink.auction_bid (
       id text PRIMARY KEY,
       auction_id text NOT NULL,
       account_id text NOT NULL,
       wallet text NOT NULL,
       amount numeric NOT NULL,
       charge_ref text NOT NULL,
       refunded boolean NOT NULL DEFAULT false,
       created_at timestamptz DEFAULT now()
     );`,
    { wrapJson: false },
  );
  await mcpExec(
    `CREATE INDEX IF NOT EXISTS auction_live_end_idx ON yuplink.auction (status, end_at);`,
    { wrapJson: false },
  ).catch(() => {});
  await mcpExec(
    `CREATE INDEX IF NOT EXISTS auction_bid_auction_idx ON yuplink.auction_bid (auction_id, created_at DESC);`,
    { wrapJson: false },
  ).catch(() => {});
  await ensureBidFunction();
  ready = true;
}

/** Длительности пресетами (часы) — как в Sendler. */
export const AUCTION_DURATIONS: Record<string, number> = {
  "1h": 1,
  "6h": 6,
  "12h": 12,
  "1d": 24,
  "3d": 72,
  "7d": 168,
};
