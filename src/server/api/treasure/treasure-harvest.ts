// Клад в «Добыче» (владелец 08.11.2026: «клад должен идти в добычу и его ещё нужно
// будет забирать»). Находка кладёт строку очереди наград: вид 'treasure', pack_id —
// id клада, ключ строки `treasure:<id>` (повтор вторую строку не кладёт). «Забрать»
// (grantRaidReward) зовёт claimTreasure — выдача pay() по ключу `treasure:<id>`.
//
// Обход расписания (раз в 5 мин, treasure-schedule):
//   • найденный и не выданный клад без строки в «Добыче» или без писем (сбой сразу
//     после копки) — поставить строку и сказать;
//   • строку забрали, а приз не выдан (процесс упал между отметкой строки и
//     выдачей) — выдать: ресурс/токен по ключу, предмет по отметке, дважды не выйдет.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { queueEncounterReward } from "@/server/api/beta-raid/reward-queue";
import { BAD_REF } from "@/server/api/raid-reward-extra";
import { liveRewardSql } from "@/server/api/raid-reward-live";
import { foundWhere, pay, tell, type Found } from "./treasure-pay";

/** Вид строки очереди; он же подпись источника (harvest.source.treasure — «Клад»). */
export const TREASURE_KIND = "treasure";
/** Отказ «пока не вышло»: строка остаётся в «Добыче» (SOFT_GRANT_ERRORS). */
export const PAY_LATER = "treasure.pay_later";

/** id строки очереди клада — тот же, что кладёт queueEncounterReward по ключу. */
const rowIdSql = (idCol: string) => `'rr_' || md5('treasure:' || ${idCol})`;

/** Строка «Клад» в «Добыче» нашедшего; повтор — без второй строки. */
export async function queueTreasure(t: Found): Promise<void> {
  await queueEncounterReward({
    account: t.account,
    mapId: t.mapId,
    cycleNo: 0,
    sourceName: TREASURE_KIND,
    kind: TREASURE_KIND,
    amount: t.amount,
    packId: t.id,
    key: `treasure:${t.id}`,
    unlabeled: true,
  });
}

/** Пак и свой товар едут в рюкзак выбранного героя (market-money.credit). */
const TO_BACKPACK: ReadonlySet<string> = new Set(["pack", "custom"]);

/**
 * Выдать приз. Героя для рюкзака нет — «нужен герой» ДО отметки (иначе приз сгорел
 * бы с «повтора не будет»). true — выдан или повтора не будет; false — повторить.
 */
async function deliver(t: Found, wallet: string): Promise<boolean> {
  if (TO_BACKPACK.has(t.resource)) {
    const { resolveBackpack } = await import("@/server/api/beta-raid/market-backpack");
    if (!(await resolveBackpack(wallet))) throw new Error("market.need_hero");
  }
  return pay(t, wallet);
}

/** «Забрать» строки клада: только нашедший; уже выдан — ничего. */
export async function claimTreasure(id: string, wallet: string): Promise<void> {
  const { raidOwner } = await import("@/server/api/beta-raid/owner");
  const account = await raidOwner(wallet);
  const t = await foundWhere(`t.id = ${sqlStr(id)} AND t.found_by = ${sqlStr(account)}`);
  if (!t) throw new Error(BAD_REF);
  if (t.paid) return;
  if (!(await deliver(t, wallet))) throw new Error(PAY_LATER);
}

export const unsettledSql = `SELECT t.id FROM yuplink.raid_treasure t
  WHERE t.status = 'found' AND t.found_by IS NOT NULL AND t.paid_at IS NULL
    AND (t.found_notified_at IS NULL
         OR NOT EXISTS (SELECT 1 FROM yuplink.raid_reward rr WHERE rr.id = ${rowIdSql("t.id")}))
  ORDER BY t.found_at LIMIT 5;`;

export const unpaidSql = `SELECT t.id, a.active_wallet AS wallet FROM yuplink.raid_treasure t
  JOIN yuplink.raid_reward rr ON rr.id = ${rowIdSql("t.id")}
  JOIN yuplink.accounts a ON a.id = t.found_by
  WHERE t.status = 'found' AND t.paid_at IS NULL
    AND rr.claimed_at < now() - interval '5 minutes' AND ${liveRewardSql("rr")}
    AND a.active_wallet IS NOT NULL
  LIMIT 5;`;

async function ids(sql: string): Promise<Array<Record<string, unknown>>> {
  const r = (await mcpExec(sql, { wrapJson: true })) as unknown[] | null;
  return Array.isArray(r) ? (r as Array<Record<string, unknown>>) : [];
}

/** Шаг обхода: довести недоставленное. Ошибка одного клада не держит остальные. */
export async function treasureHarvestPass(): Promise<void> {
  for (const x of await ids(unsettledSql)) {
    const t = await foundWhere(`t.id = ${sqlStr(String(x.id))}`).catch(() => null);
    if (!t) continue;
    await queueTreasure(t).catch(() => {});
    await tell(t).catch(() => {});
  }
  for (const x of await ids(unpaidSql)) {
    const t = await foundWhere(`t.id = ${sqlStr(String(x.id))}`).catch(() => null);
    if (!t || t.paid) continue;
    // Не вышло (нет героя, сбой начисления) — строку обратно в «Добычу», заберёт сам.
    if (await deliver(t, String(x.wallet)).catch(() => false)) continue;
    await mcpExec(
      `UPDATE yuplink.raid_reward SET claimed_at = NULL WHERE id = ${rowIdSql(sqlStr(t.id))};`,
    ).catch(() => {});
  }
}
