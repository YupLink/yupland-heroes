// Авторассылка «Раздачи DARAI»: «К распределению» держится выше порога → та
// же раздача, что по кнопке (50 % дупло, 12,5 % Ярославу, 12,5 % Мише, 25 %
// держателям legendary), но без подтверждения в Telegram — итог приходит в бота.
// Включает только владелец (режим «авто» у правила darai_free).
//
// Защита от чужих и двойных денег:
//  · сумма — МИНИМУМ «К распределению» за последний час наблюдений (раз в 5
//    минут) и свежего строгого счёта; наблюдений меньше 40 минут — не шлём.
//    Деньги, пришедшие на склад и ещё не записанные (пополнение казны в
//    отстое, депозит игрока до зачёта), дают всплеск — всплеск не уходит;
//  · строгий счёт пулов: любая часть не прочиталась — рассылки нет;
//  · замок — строка money_batch (bucket 'darai_free'), одна на все воркеры, и
//    ставится, только если: час не было авторассылки; нет открытой пачки
//    подписки; нет ручной заявки DARAI, ждущей кнопки, и ручной раздачи за час;
//  · держатели legendary — только из Sendler (запасная база бывает старой).
import { nanoid } from "nanoid";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { firstRow } from "../energy-sub/grant";
import { setStatus } from "../energy-sub/batch-steps";
import { loadDist } from "./rules";
import { observe, observedMin } from "./observations";

export const FREE_BUCKET = "darai_free";
export const COOLDOWN_MINUTES = 60;

export function lockSql(id: string, amount: number): string {
  const recent = `now() - interval '${COOLDOWN_MINUTES} minutes'`;
  return `
WITH b AS (
  INSERT INTO yuplink.money_batch (id, bucket, token, amount, status, created_by)
  SELECT ${sqlStr(id)}, ${sqlStr(FREE_BUCKET)}, 'Darai', ${amount.toFixed(2)}, 'running', 'auto'
   WHERE NOT EXISTS (SELECT 1 FROM yuplink.money_batch
                      WHERE (bucket = ${sqlStr(FREE_BUCKET)} AND updated_at > ${recent})
                         OR (bucket <> ${sqlStr(FREE_BUCKET)} AND status IN ('running', 'failed')))
     AND NOT EXISTS (SELECT 1 FROM yuplink.admin_batch_payouts_pending
                      WHERE upper(reward_symbol) = 'DARAI'
                        AND ((status = 'pending' AND created_at > now() - interval '7 days')
                          OR (status IN ('approved', 'done', 'failed') AND decided_at > ${recent})))
     AND NOT EXISTS (SELECT 1 FROM yuplink.admin_payouts_pending
                      WHERE upper(reward_symbol) = 'DARAI'
                        AND ((status = 'pending' AND requested_at > now() - interval '7 days')
                          OR (status IN ('approved', 'executed', 'failed') AND approved_at > ${recent})))
  ON CONFLICT DO NOTHING
  RETURNING id
)
SELECT row_to_json(_t.*) AS _row FROM (SELECT (SELECT id FROM b) AS id) _t;`;
}

async function notify(text: string): Promise<void> {
  const { sendTgMessageToAdmins } = await import("../../tg");
  await sendTgMessageToAdmins(text).catch(() => {});
}

const fmt = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
const floor2 = (n: number) => Math.floor(Math.max(0, n) * 100) / 100;

/** Проверить правило и, если порог держится, разослать. id строки замка или null. */
export async function runFreeDaraiAuto(): Promise<string | null> {
  const { rules } = await loadDist();
  const rule = rules.darai_free;
  if (rule.mode !== "auto" || !(rule.threshold > 0)) return null;

  const { daraiPools } = await import("../darai-pools");
  const soft = await daraiPools();
  await observe(soft.payoutAvailable);
  if (soft.payoutAvailable < rule.threshold) return null;
  const windowMin = await observedMin();
  if (windowMin == null || windowMin < rule.threshold) return null;

  let id: string | null | undefined;
  try {
    id = firstRow<{ id: string | null }>(await mcpExec(lockSql(`mb_${nanoid(12)}`, windowMin)))?.id;
  } catch (e) {
    // Вставка могла пройти, а ответ потеряться: тогда строка «идёт» держит
    // замок, пока владелец не закроет её (через 15 минут — «зависла»).
    await notify(`⚠️ Авторассылка DARAI: замок не подтвердился (${e instanceof Error ? e.message : e}). Проверь пачки на экране авторассылок.`);
    return null;
  }
  if (!id) return null;

  try {
    // Свежий строгий счёт — уже под замком.
    const pools = await daraiPools({ strict: true });
    const amount = floor2(Math.min(windowMin, pools.payoutAvailable));
    if (amount < rule.threshold) {
      await mcpExec(`DELETE FROM yuplink.money_batch WHERE id = ${sqlStr(id)} AND status = 'running';`);
      return null;
    }
    const { distributionPreview, distributionItems, DARAI_FT_CONTRACT, DARAI_DECIMALS } = await import(
      "../payouts-plan"
    );
    const preview = await distributionPreview(pools, amount);
    if (preview.legendary.holdersSource !== "sendler" || preview.legendary.activeHoldersCount === 0) {
      throw new Error("держатели legendary не прочитались из Sendler — рассылка не ушла");
    }
    const items = distributionItems(preview);
    const { runAutoBatchPayout } = await import("../../adminBatchPayoutRun");
    const r = await runAutoBatchPayout({
      ftContract: DARAI_FT_CONTRACT,
      symbol: "DARAI",
      decimals: DARAI_DECIMALS,
      items,
      reason: `Авторассылка DARAI от ${fmt(amount)} (порог ${fmt(rule.threshold)})`,
    });
    const tx = r.txHashes.map((h) => `tx: ${h}`).join("\n");
    if (r.allPaid) {
      await setStatus(id, "done");
      await notify(`✅ Авторассылка DARAI: ${fmt(amount)} на ${items.length} получателей (${r.id})\n${tx}`);
    } else {
      const msg = `${r.txError ?? "часть получателей без денег"} · не оплачено: ${r.unpaid.length} (${r.id})`;
      await setStatus(id, "failed", msg);
      await notify(`⚠️ Авторассылка DARAI прошла не целиком: ${msg}\n${tx}`);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await setStatus(id, "failed", msg);
    await notify(`⚠️ Авторассылка DARAI встала: ${msg}`);
  }
  return id;
}
