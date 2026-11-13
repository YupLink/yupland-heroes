// Задания генератора артефактов (§8.122) в yuplink.artifact_craft, kind = 'gen'.
// Ход: ключ нажатия → плата → задание сразу 'queued' (рисует цепочка
// лаборатории — lab-run.advanceJob) → done | failed. Не вышло — уплаченное
// возвращается само: возврат захватывается меткой (refund_token) — один
// обработчик, а повтор того же запроса мостом узнаёт свой захват.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import type { PortalPrice } from "@/lib/portal";
import type { NewJob } from "@/server/api/craft/lab-sql";
import { falOn } from "@/server/craft/falAi";
import { nextStep, type GenStep } from "@/lib/artGen/artGenStep";

/** Предохранитель: в работе одновременно на аккаунт. Сколько подряд и почём — artGenStep. */
export const GEN_QUEUE_LIMIT = 3;
/**
 * Бесплатных генераций в сутки (UTC) на ВСЕХ игроков (владелец 08.11: «в день можно
 * сделать до 50 генераций всего, снизу писать осталось 45 из 50»). Не вышедшие слот не
 * держат. 11.11: «после бесплатного — через fal.ai… когда лимит в том, чем делали до
 * этого, исчерпается» — с ключом fal.ai предела нет: рисуют бесплатные, пока могут,
 * дальше fal.ai (lab-run → generate). Без ключа — предел, как был.
 */
export const GEN_WORLD_DAY_LIMIT = 50;

/** Ключ оплаты задания: и плата, и её возврат идут под ним (resource-pay, keyed). */
export const genPayRef = (jobId: string) => `artgen:${jobId}`;
/** Ключ оплаты «уникальности» — шаблон и попытка (каждая попытка — своя плата). */
export const genUniqueRef = (templateId: string, attempt: string) =>
  `artgenu:${templateId}:${attempt}`;

export type GenRow = { id: string; wallet: string; paid: PortalPrice[] };

const json = <T>(v: unknown, dflt: T): T => {
  if (v == null) return dflt;
  return (typeof v === "string" ? JSON.parse(v) : v) as T;
};

const TODAY = `created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`;
/** Генерации сегодня на всех — что держит дневной слот (не вышедшие не в счёт). */
const WORLD_USED = `(SELECT count(*) FROM yuplink.artifact_craft
                      WHERE kind = 'gen' AND status <> 'failed' AND ${TODAY})`;

/** Сколько генераций сегодня ещё осталось на всех. */
export async function genWorldLeft(): Promise<number> {
  const rows = (await mcpExec(`SELECT ${WORLD_USED}::int AS used;`, { wrapJson: true })) as Array<{
    used: number;
  }> | null;
  return Math.max(0, GEN_WORLD_DAY_LIMIT - Number(rows?.[0]?.used ?? 0));
}

/** Последний оплаченный заказ аккаунта (не вышедшие — цена назад, не в счёт). */
const lastPaidSql = (account: string) => `(SELECT max(created_at) FROM yuplink.artifact_craft
   WHERE account_id = ${sqlStr(account)} AND kind = 'gen' AND status <> 'failed')`;

export type GenGate = GenStep & {
  /** Почему нельзя; null — можно заказывать. */
  limit: "world_limit" | "day_limit" | "queue_full" | null;
  /** Момент последнего оплаченного заказа — по нему сверяется цепочка при записи. */
  last: string | null;
};

/** Можно ли заказать и какой это будет заказ подряд (цена — stepPrice). */
export async function genGate(account: string): Promise<GenGate> {
  const acc = sqlStr(account);
  const rows = (await mcpExec(
    `SELECT (SELECT count(*) FROM yuplink.artifact_craft
              WHERE account_id = ${acc} AND kind = 'gen' AND status = 'queued')::int AS queued,
            (SELECT coalesce(json_agg(x ORDER BY x.ms DESC), '[]'::json) FROM (
               SELECT created_at::text AS at, extract(epoch FROM created_at) * 1000 AS ms
                 FROM yuplink.artifact_craft
                WHERE account_id = ${acc} AND kind = 'gen' AND status <> 'failed'
                ORDER BY created_at DESC LIMIT 5) x) AS paid;`,
    { wrapJson: true },
  )) as Array<{ queued: number; paid: unknown }> | null;
  const r = rows?.[0];
  const paid = json<Array<{ at: string; ms: number }>>(r?.paid, []);
  const s = nextStep(
    paid.map((p) => Number(p.ms)),
    Date.now(),
  );
  const last = paid[0]?.at ?? null;
  let limit: GenGate["limit"] = null;
  if (!falOn() && (await genWorldLeft()) <= 0) limit = "world_limit";
  else if (s.step === null) limit = "day_limit";
  else if (Number(r?.queued ?? 0) >= GEN_QUEUE_LIMIT) limit = "queue_full";
  return { ...s, limit, last };
}

/**
 * Занять ключ нажатия ДО оплаты (как «Забвение»): из двух одинаковых запросов
 * платит один. Своя метка — значит ключ занял этот вызов (и повтор моста тоже).
 */
export async function claimGenOp(op: string, account: string, mark: string): Promise<boolean> {
  const key = sqlStr(`artgen:${op}`);
  await mcpExec(
    `INSERT INTO yuplink.hero_boost_op (op, hero_id, stat, amount, source)
     VALUES (${key}, ${sqlStr(account)}, 'artgen', 1, ${sqlStr(mark)})
     ON CONFLICT (op) DO NOTHING;`,
  );
  const rows = (await mcpExec(
    `SELECT source FROM yuplink.hero_boost_op WHERE op = ${key} LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ source: string | null }> | null;
  return rows?.[0]?.source === mark;
}

/** Задание по ключу нажатия (повтор того же «Создать»). */
export async function jobIdByNonce(account: string, nonce: string): Promise<string | null> {
  const rows = (await mcpExec(
    `SELECT id FROM yuplink.artifact_craft
      WHERE account_id = ${sqlStr(account)} AND nonce = ${sqlStr(nonce)} AND kind = 'gen' LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ id: string }> | null;
  return rows?.[0]?.id ?? null;
}

/**
 * Оплаченное задание — сразу в очередь рисования. Повтор моста — то же задание.
 * Дневной слот на всех проверяется под замком тем же вызовом: двое, заплативших
 * за последний слот, не впишутся оба — второму false, и цена ему назад. С fal.ai
 * предела нет. Там же сверяется цепочка аккаунта: цену считали по последнему
 * заказу last — с тех пор лёг другой (два «Создать» разом) — false, цена назад.
 */
export async function insertGenJob(
  j: NewJob & { mapId: string; q: number; r: number; paid: PortalPrice[]; last: string | null },
): Promise<boolean> {
  const free = falOn() ? "true" : `${WORLD_USED} < ${GEN_WORLD_DAY_LIMIT}`;
  const seen = j.last ? `${sqlStr(j.last)}::timestamptz` : "NULL";
  await mcpExec(
    `SELECT pg_advisory_xact_lock(hashtext('artgen:world')) AS l;
     INSERT INTO yuplink.artifact_craft
       (id, account_id, wallet, nonce, rarity, slot, form, boost, roll, name, prompt,
        status, kind, map_id, q, r, paid)
     SELECT ${sqlStr(j.id)}, ${sqlStr(j.account)}, ${sqlStr(j.wallet)}, ${sqlStr(j.nonce)},
             ${sqlStr(j.rarity)}, ${sqlStr(j.slot)}, ${sqlStr(j.form)},
             ${sqlStr(JSON.stringify(j.boost))}::jsonb, ${sqlStr(JSON.stringify(j.roll))}::jsonb,
             ${sqlStr(j.name)}, ${sqlStr(j.prompt)}, 'queued', 'gen', ${sqlStr(j.mapId)},
             ${Math.trunc(j.q)}, ${Math.trunc(j.r)}, ${sqlStr(JSON.stringify(j.paid))}::jsonb
      WHERE ${free} AND ${lastPaidSql(j.account)} IS NOT DISTINCT FROM ${seen}
     ON CONFLICT (account_id, nonce) DO NOTHING;`,
  );
  return (await jobIdByNonce(j.account, j.nonce)) === j.id;
}

/** Не вышедшие и ещё не возвращённые задания аккаунта. */
export async function failedUnrefunded(account: string): Promise<GenRow[]> {
  const rows = (await mcpExec(
    `SELECT id, wallet, paid FROM yuplink.artifact_craft
      WHERE account_id = ${sqlStr(account)} AND kind = 'gen' AND status = 'failed'
        AND refunded_at IS NULL
      LIMIT 20;`,
    { wrapJson: true },
  )) as Array<Record<string, unknown>> | null;
  return (rows ?? []).map((r) => ({
    id: String(r.id),
    wallet: String(r.wallet),
    paid: json<PortalPrice[]>(r.paid, []),
  }));
}

/** Захватить возврат меткой; true — возвращает этот вызов (или его повтор мостом). */
export async function claimRefund(id: string, token: string): Promise<boolean> {
  const rows = (await mcpExec(
    `UPDATE yuplink.artifact_craft SET refunded_at = now(), refund_token = ${sqlStr(token)}
      WHERE id = ${sqlStr(id)} AND kind = 'gen' AND status = 'failed'
        AND (refunded_at IS NULL OR refund_token = ${sqlStr(token)})
      RETURNING id;`,
    { wrapJsonCte: true },
  )) as Array<{ id: string }> | null;
  return !!rows?.[0]?.id;
}
