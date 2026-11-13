// Задания лаборатории в базе (yuplink.artifact_craft, migrations/craft-01-lab.sql).
// Бросок записывается при создании и больше не меняется: неудачная картинка
// перерисовывается другим посевом, характеристики — те же.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import type { CraftBoost, CraftRoll } from "@/lib/craft/craftRoll";
import type { CraftRarity } from "@/lib/craft/craftTable";
import type { HordeExt } from "@/server/craft/hordeAnon";

/** paying — генератор (§8.122): задание заведено, оплата ещё не подтверждена. */
export type LabStatus = "paying" | "queued" | "done" | "failed";

export type LabJob = {
  id: string;
  rarity: CraftRarity;
  slot: string;
  form: string;
  boost: CraftBoost;
  roll: CraftRoll;
  name: string;
  prompt: string;
  status: LabStatus;
  tries: number;
  nextAt: string;
  lastError: string | null;
  templateId: string | null;
  imageUrl: string | null;
  createdAt: string;
  /** Заказ в AI Horde, который ещё рисуется (generate.ts); null — заказа нет. */
  ext: HordeExt | null;
  /** lab — лаборатория админа (§8.81), gen — генератор артефактов игрока (§8.122). */
  kind: "lab" | "gen";
};

export type NewJob = Omit<
  LabJob,
  "status" | "tries" | "nextAt" | "lastError" | "templateId" | "imageUrl" | "createdAt" | "ext" | "kind"
> & {
  account: string;
  wallet: string;
  nonce: string;
};

const COLS = `id, rarity, slot, form, boost, roll, name, prompt, status, tries, next_at,
  last_error, template_id, image_url, created_at, ext, kind`;

const json = <T>(v: unknown): T => (typeof v === "string" ? JSON.parse(v) : v) as T;
const str = (v: unknown) => (v == null ? null : String(v));

function toJob(r: Record<string, unknown>): LabJob {
  return {
    id: String(r.id),
    rarity: String(r.rarity) as CraftRarity,
    slot: String(r.slot),
    form: String(r.form),
    boost: json<CraftBoost>(r.boost) ?? {},
    roll: json<CraftRoll>(r.roll),
    name: String(r.name),
    prompt: String(r.prompt),
    status: String(r.status) as LabStatus,
    tries: Number(r.tries) || 0,
    nextAt: String(r.next_at),
    lastError: str(r.last_error),
    templateId: str(r.template_id),
    imageUrl: str(r.image_url),
    createdAt: String(r.created_at),
    ext: r.ext ? json<HordeExt>(r.ext) : null,
    kind: r.kind === "gen" ? "gen" : "lab",
  };
}

/** SELECT — wrapJson; INSERT/UPDATE … RETURNING в подзапрос не заворачивается,
 *  только через WITH — wrapJsonCte. */
async function rows(sql: string, dml = false): Promise<LabJob[]> {
  const out = (await mcpExec(sql, dml ? { wrapJsonCte: true } : { wrapJson: true })) as Array<
    Record<string, unknown>
  > | null;
  return (out ?? []).map(toJob);
}

const mine = (account: string, id: string) =>
  `id = ${sqlStr(id)} AND account_id = ${sqlStr(account)}`;

/**
 * Новое задание — если сегодня (UTC) их меньше dayLimit и в работе меньше
 * queueLimit. Тот же nonce — то же задание (двойное нажатие).
 */
export async function insertJob(
  j: NewJob,
  dayLimit: number,
  queueLimit: number,
): Promise<LabJob | "day_limit" | "queue_full"> {
  const acc = sqlStr(j.account);
  const made = await rows(
    `INSERT INTO yuplink.artifact_craft
       (id, account_id, wallet, nonce, rarity, slot, form, boost, roll, name, prompt)
     SELECT ${sqlStr(j.id)}, ${acc}, ${sqlStr(j.wallet)}, ${sqlStr(j.nonce)}, ${sqlStr(j.rarity)},
            ${sqlStr(j.slot)}, ${sqlStr(j.form)}, ${sqlStr(JSON.stringify(j.boost))}::jsonb,
            ${sqlStr(JSON.stringify(j.roll))}::jsonb, ${sqlStr(j.name)}, ${sqlStr(j.prompt)}
      WHERE (SELECT count(*) FROM yuplink.artifact_craft
              WHERE account_id = ${acc} AND kind = 'lab' AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC') < ${dayLimit}
        AND (SELECT count(*) FROM yuplink.artifact_craft
              WHERE account_id = ${acc} AND kind = 'lab' AND status = 'queued') < ${queueLimit}
     ON CONFLICT (account_id, nonce) DO NOTHING
     RETURNING ${COLS};`,
    true,
  );
  if (made[0]) return made[0];
  const same = await rows(
    `SELECT ${COLS} FROM yuplink.artifact_craft
      WHERE account_id = ${acc} AND nonce = ${sqlStr(j.nonce)} LIMIT 1;`,
  );
  if (same[0]) return same[0];
  const today = await todayCount(j.account);
  return today >= dayLimit ? "day_limit" : "queue_full";
}

export async function todayCount(account: string): Promise<number> {
  const out = (await mcpExec(
    `SELECT count(*)::int AS n FROM yuplink.artifact_craft
      WHERE account_id = ${sqlStr(account)} AND kind = 'lab'
        AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';`,
    { wrapJson: true },
  )) as Array<{ n: number }> | null;
  return Number(out?.[0]?.n ?? 0);
}

export async function listJobs(account: string, limit = 20): Promise<LabJob[]> {
  return rows(
    `SELECT ${COLS} FROM yuplink.artifact_craft WHERE account_id = ${sqlStr(account)} AND kind = 'lab'
      ORDER BY created_at DESC LIMIT ${Math.max(1, Math.min(100, Math.floor(limit)))};`,
  );
}

export async function loadJob(account: string, id: string): Promise<LabJob | null> {
  return (
    (await rows(`SELECT ${COLS} FROM yuplink.artifact_craft WHERE ${mine(account, id)};`))[0] ??
    null
  );
}

/**
 * Взять задание в работу: одно задание — один обработчик. Аренда 10 минут —
 * с запасом дольше худшего шага цепочки генераторов (все три по таймаутам —
 * ~6 мин), и она с меткой: опоздавший обработчик чужую аренду не сбросит и
 * задание не закроет (token ниже).
 */
export async function claimJob(account: string, id: string, token: string): Promise<LabJob | null> {
  const got = await rows(
    `UPDATE yuplink.artifact_craft
        SET lease_until = now() + interval '10 minutes', lease_token = ${sqlStr(token)}
      WHERE ${mine(account, id)} AND status = 'queued' AND next_at <= now()
        AND (lease_until IS NULL OR lease_until < now())
      RETURNING ${COLS};`,
    true,
  );
  return got[0] ?? null;
}

/** Генератор занят (квота) — ждать, попытка не тратится. */
export async function jobWait(id: string, token: string, seconds: number, why: string) {
  await mcpExec(
    `UPDATE yuplink.artifact_craft
        SET next_at = now() + make_interval(secs => ${Math.max(30, Math.floor(seconds))}),
            lease_until = NULL, lease_token = NULL, last_error = ${sqlStr(why.slice(0, 200))}
      WHERE id = ${sqlStr(id)} AND status = 'queued' AND lease_token = ${sqlStr(token)};`,
  );
}

/** Заказ ушёл в Horde (или ещё рисуется там) — запомнить его, попытка не тратится. */
export async function jobPending(id: string, token: string, ext: HordeExt, seconds: number) {
  await mcpExec(
    `UPDATE yuplink.artifact_craft
        SET ext = ${sqlStr(JSON.stringify(ext))}::jsonb, lease_until = NULL, lease_token = NULL,
            next_at = now() + make_interval(secs => ${Math.max(10, Math.floor(seconds))}),
            last_error = NULL
      WHERE id = ${sqlStr(id)} AND status = 'queued' AND lease_token = ${sqlStr(token)};`,
  );
}

/** Картинка не вышла — минус попытка; кончились — задание «не вышло». */
export async function jobMiss(id: string, token: string, why: string, maxTries: number) {
  await mcpExec(
    `UPDATE yuplink.artifact_craft
        SET tries = tries + 1, lease_until = NULL, lease_token = NULL, ext = NULL,
            last_error = ${sqlStr(why.slice(0, 200))},
            status = CASE WHEN tries + 1 >= ${maxTries} THEN 'failed' ELSE status END
      WHERE id = ${sqlStr(id)} AND status = 'queued' AND lease_token = ${sqlStr(token)};`,
  );
}

/** Задание висит дольше суток — «не вышло» (повтор — кнопкой). Взятое в
 *  работу не трогаем: его закроет тот, кто рисует. */
export async function expireJobs(account: string): Promise<void> {
  await mcpExec(
    `UPDATE yuplink.artifact_craft
        SET status = 'failed', last_error = 'timeout', lease_until = NULL, lease_token = NULL
      WHERE account_id = ${sqlStr(account)} AND status = 'queued'
        AND queued_at < now() - interval '24 hours'
        AND (lease_until IS NULL OR lease_until < now());`,
  );
}

/** Повторить неудавшееся: попытки с нуля, бросок прежний. */
export async function retryJob(account: string, id: string): Promise<boolean> {
  const got = await rows(
    `UPDATE yuplink.artifact_craft
        SET status = 'queued', tries = 0, next_at = now(), lease_until = NULL,
            lease_token = NULL, ext = NULL, last_error = NULL, queued_at = now()
      WHERE ${mine(account, id)} AND status = 'failed' AND kind = 'lab'
      RETURNING ${COLS};`,
    true,
  );
  return !!got[0];
}
