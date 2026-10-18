// ЗАБВЕНИЕ на аккаунте: что висит сейчас и выдача зарядов/времени.
//
// Модель и правила — lib/hero/boostOblivion.ts (пара «уровень + минуты» —
// lib/hero/oblivionRule.ts), SQL — oblivion-sql.ts. Выдают
// эффект три источника: зелье/товар и заклинание (hero-buff.applyBoostRoll) и
// постройка «Забвение» (oblivion-temple.ts). Тратит его книга героя
// (oblivion-forget.ts).
import { nanoid } from "nanoid";
import { createServerFn } from "@tanstack/react-start";
import { mcpExec } from "@/server/db/mcpClient";
import { requireBetaRaid } from "@/server/api/beta-raid/gate";
import { raidOwner } from "@/server/api/beta-raid/owner";
import { sqlRow } from "@/server/api/beta-raid/chest/chest-row";
import { oblivionGrantSql, oblivionStateSql } from "@/server/api/beta-raid/oblivion-sql";
import {
  NO_OBLIVION,
  OBLIVION_LV_KIND,
  OBLIVION_LVT_KIND,
  OBLIVION_TIME_KIND,
  type OblivionState,
} from "@/lib/hero/boostOblivion";
import { sqlStr } from "@/server/api/raid-shared";

type StateRow = { kind: string; value: number | string; expires_at: string };

/**
 * Что висит на аккаунте. Сроки отдаём ISO: клиент считает таймеры сам. Поля
 * timedLevel/timedUntil (заряды со сроком) старая вкладка просто не прочтёт.
 */
export async function loadOblivion(account: string): Promise<OblivionState> {
  if (!account) return NO_OBLIVION;
  const rows = (await mcpExec(oblivionStateSql(account), { wrapJson: true })) as StateRow[];
  const out: OblivionState = { ...NO_OBLIVION };
  for (const r of rows ?? []) {
    const value = Math.max(0, Math.floor(Number(r.value) || 0));
    const at = Date.parse(String(r.expires_at));
    const until = Number.isFinite(at) ? new Date(at).toISOString() : null;
    if (r.kind === OBLIVION_LV_KIND) out.level = value;
    else if (r.kind === OBLIVION_TIME_KIND) out.until = until;
    else if (r.kind === OBLIVION_LVT_KIND && value > 0 && until) {
      out.timedLevel = value;
      out.timedUntil = until;
    }
  }
  return out;
}

/**
 * Выдать эффект одним оператором. `ref` — ключ выдачи в raid_backpack_op:
 * повтор того же ключа (мост, повторный вызов) второй раз не прибавит. Вернёт
 * true, если выдал именно этот вызов.
 */
export async function grantOblivion(
  account: string,
  roll: { amount: number; minutes: number },
  ref: string,
  source: string | null = null,
): Promise<boolean> {
  const minutes = Math.max(0, Math.floor(Number(roll.minutes) || 0));
  const level = Math.max(0, Math.floor(Number(roll.amount) || 0));
  // Пустой бросок (ни зарядов, ни минут) в базу не ходит: выдавать нечего.
  const sql = oblivionGrantSql({ id: `bpe_${nanoid(10)}`, account, level, minutes, ref, source });
  if (!sql) return false;
  const row = sqlRow<{ fresh: boolean }>((await mcpExec(sql, { wrapJson: false })) as unknown[]);
  return row?.fresh === true;
}

/**
 * Лёг ли ключ операции в raid_backpack_op. Ключ пишется тем же оператором,
 * что и само дело (выдача эффекта, забвение у столба): есть ключ — дело
 * сделано, даже если ответ моста потерялся.
 */
export async function opMarked(ref: string): Promise<boolean> {
  const rows = (await mcpExec(
    `SELECT 1 AS hit FROM yuplink.raid_backpack_op WHERE op = ${sqlStr(ref)} LIMIT 1;`,
    { wrapJson: true },
  )) as unknown[];
  return (rows?.length ?? 0) > 0;
}

/**
 * Зелье или заклинание: свой ключ на каждый вызов. Приложение от повтора
 * нажатия уже держит ключ операции (claimBoostOp), а этот ключ — от слепого
 * повтора моста: тот шлёт ту же строку SQL, с тем же ключом. Мост сдался, а
 * ключ лёг — эффект выдан, и зелье (или энергию каста) возвращать не за что.
 */
export async function grantOblivionTo(
  wallet: string,
  roll: { amount: number; minutes: number },
): Promise<void> {
  const account = await raidOwner(wallet);
  const ref = `oblg:${nanoid(16)}`;
  try {
    await grantOblivion(account, roll, ref);
  } catch (e) {
    if (!(await opMarked(ref).catch(() => false))) throw e;
  }
}

/**
 * Что висит на мне — для значка над героем и кнопки «Забыть» в книге.
 * serverNow — часы сервера: по ним клиент поправляет свои (oblivionClock), у
 * телефона они бывают сбиты. Старая вкладка поле просто не прочтёт.
 */
export const getMyOblivion = createServerFn({ method: "GET" }).handler(
  async (): Promise<OblivionState & { serverNow: number }> => {
    const state = await loadOblivion(await raidOwner(await requireBetaRaid()));
    return { ...state, serverNow: Date.now() };
  },
);
