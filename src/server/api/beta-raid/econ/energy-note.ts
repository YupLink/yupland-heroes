// «На что ушла энергия»: суточный агрегат по причинам (yuplink.energy_spend_daily).
//
// В currency_ledger все траты — один вид energy_spend без ref, и по нему не
// видно, шаги это, бои или порталы. Точки списания докладывают причину сюда
// сами, ПОСЛЕ удачного списания. Best-effort: сбой — console.warn, игроку
// ничего не ломает. В горячем пути (шаг по карте) звать без await:
// `void noteEnergySpend(...)` — запись догонит, ответ игроку её не ждёт.
import { mcpExec } from "../../../db/mcpClient";
import { sqlStr } from "../../raid-shared";
import { raidOwner } from "../owner";
import { actedSql } from "../fishing/fishing-sql";
import { fishStopsOn } from "@/lib/raid/fishing";
import type { EnergySpendReason } from "@/lib/econ/types";

/** UPSERT за сутки по UTC (как created_at в леджерах): сумма и число списаний. */
export function energyNoteSql(
  accountId: string,
  amount: number,
  reason: EnergySpendReason,
): string {
  return `INSERT INTO yuplink.energy_spend_daily AS d (account_id, day, reason, amount, n)
    VALUES (${sqlStr(accountId)}, (now() AT TIME ZONE 'UTC')::date, ${sqlStr(reason)}, ${amount}, 1)
    ON CONFLICT (account_id, day, reason) DO UPDATE
      SET amount = d.amount + EXCLUDED.amount, n = d.n + 1;`;
}

/**
 * Причина траты по аккаунту. Никогда не бросает; amount ≤ 0 — мимо.
 *
 * Трата энергии — ещё и «другое действие» героя: рыбалка кончается (ПРАВИЛА
 * §8.35), кроме покупки за энергию и стейкинга фишек. Отметка идёт ТЕМ ЖЕ
 * оператором (actedSql: не рыбачит — строки нет, ничего), лишнего рейса к базе
 * у шага и удара нет. Таблица raid_fishing обязана быть (миграция fish-01 — до
 * кода), иначе эта заметка не запишется.
 */
export async function noteEnergySpend(
  accountId: string | null | undefined,
  amount: number,
  reason: EnergySpendReason,
): Promise<void> {
  if (!accountId || !(amount > 0)) return;
  const fish = fishStopsOn(reason) ? `\n${actedSql(accountId)}` : "";
  try {
    await mcpExec(energyNoteSql(accountId, amount, reason) + fish, { wrapJson: false });
  } catch (e) {
    console.warn("energy-note", reason, e instanceof Error ? e.message : String(e));
  }
}

/**
 * Точки, где известен только кошелёк: аккаунт — из кэша raidOwner (30 с, тот
 * же, что у шага и боя), лишнего рейса к базе на списание не добавляем.
 */
export async function noteEnergySpendByWallet(
  wallet: string,
  amount: number,
  reason: EnergySpendReason,
): Promise<void> {
  if (!(amount > 0)) return;
  const account = await raidOwner(wallet).catch(() => null);
  await noteEnergySpend(account, amount, reason);
}
