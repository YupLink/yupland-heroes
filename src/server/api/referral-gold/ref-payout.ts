// Суточное начисление рефки золотом (ПРАВИЛА §8.101): «золото за рефералов
// начисляется раз в день». Всё, что друзья купили до полуночи UTC, — одним
// движением золота на пригласившего (res_ledger 'referral') и право обменять
// его на DARAI без лимита лицензии неделю (ref_gold_right) — одной функцией
// базы ref_payout_run (migrations/ref-02): под общим локом, ключ — день и
// набор строк, поэтому сколько бы воркеров ни звали, начисление одно.
//
// Часы: раз в 10 минут в каждом воркере — работа есть только после полуночи
// (строки прошлых дней); заодно — ждущий откуп золота фонда выкупа.
import { mcpExec } from "../../db/mcpClient";
import { runBuyback } from "../bank/license-money";

const EVERY_MS = 10 * 60_000;
let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

/** Начислить всё, что куплено друзьями до начала текущих суток UTC. */
export async function runRefPayout(): Promise<number> {
  const rows = (await mcpExec(
    `SELECT r_account, r_gold::text AS gold, r_applied FROM yuplink.ref_payout_run(
       date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC');`,
    { wrapJson: true },
  )) as Array<{ r_account: string; gold: string; r_applied: boolean }> | null;
  const paid = (rows ?? []).filter((r) => r.r_applied);
  if (paid.length > 0) {
    console.log(
      `[ref-gold] начислено ${paid.length}: ${paid.map((r) => `${r.r_account} +${r.gold}`).join(", ")}`,
    );
    // Письмо пригласившему — сколько пришло и до какого числа меняется без лимита.
    const { notifyRefGold } = await import("./ref-notify");
    await notifyRefGold(
      paid.map((r) => ({ account: r.r_account, gold: Number(r.gold) || 0 })),
    ).catch((e) => console.warn("[ref-gold] письма:", e instanceof Error ? e.message : e));
  }
  return paid.length;
}

async function pass(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await runRefPayout();
    await runBuyback();
  } catch (e) {
    console.warn("[ref-gold] начисление:", e instanceof Error ? e.message : e);
  } finally {
    running = false;
  }
}

/** Запустить часы один раз на процесс (зовёт map-serve рядом с прочими). */
export function startRefPayoutTicker(): void {
  if (timer) return;
  timer = setInterval(() => void pass(), EVERY_MS);
  void pass();
}
