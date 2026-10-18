// Самопочинка вставших пачек подписки — раз в 5 минут, из runDue «auto».
// 03.10 две пачки простояли часами из-за сбоя узлов NEAR и повторного nonce:
// деньги лежали, а пачка ждала, пока владелец сверит кошельки руками.
//
//  · Шага «sending» нет — в сети ничего не висит: пачку можно продолжать
//    (не чаще раза в 15 минут, не больше 3 раз за жизнь процесса — дальше руками).
//  · Шаг «sending» с подписанными байтами (старше 3 минут, моложе 12 часов):
//      сперва пачка забирается (CAS) — потом любые действия в сети;
//      транзакция нашлась и прошла → «done» (обмен — с приходом DARAI по логам);
//      нашлась и упала → перевод «retry» (одна квитанция: не ушло ничего),
//        обмен — владельцу;
//      не нашлась → отправляем ТЕ ЖЕ байты ещё раз (дважды сеть их не
//        исполнит): прошла → «done»; сеть отвергла (InvalidNonce/Expired) и
//        два разных провайдера прямо отвечают «такой нет» → «retry» (не больше
//        3 повторов шага — дальше владелец). Ничего не решили — пачку отпускаем.
//  · Без байтов (шаги до 03.10) и всё сомнительное — владелец, письмо раз в час.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { pushStep, stepOf, type Step } from "./batch-steps";
import { shouldNotify } from "./batch-revert";

const SETTLE_MS = 3 * 60_000;
const WINDOW_MS = 12 * 3_600_000;
const MAX_RESUMES = 3;
const resumes = new Map<string, number>();

type Row = { id: string; bucket: string; status: string; steps: Step[] | null; updated_at: string; idle: boolean };

export type Verdict =
  | { kind: "done"; hash: string; received?: number }
  | { kind: "retry"; why: string }
  | { kind: "wait" }
  | { kind: "owner"; why: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/** Что показала сеть по найденной транзакции. */
async function judgeOutcome(step: Step, outcome: unknown, signer: string): Promise<Verdict> {
  const status = isObj(outcome) ? outcome.status : undefined;
  const ok = isObj(status) && "SuccessValue" in status;
  const failed = isObj(status) && "Failure" in status;
  if (step.name === "swap") {
    if (failed) return { kind: "owner", why: "обмен в сети завершился ошибкой" };
    if (!ok) return { kind: "wait" };
    const { usdtSentInLogs } = await import("./batch-resolve");
    const { receivedFromLogs, usdtUsedRaw } = await import("../ref-swap-core");
    if (usdtUsedRaw(outcome) === 0n) return { kind: "retry", why: "Ref вернул USDT — обмена не было" };
    const sent = usdtSentInLogs(outcome, signer);
    const received = receivedFromLogs(outcome, signer);
    if (Math.abs(sent - Number(step.amount ?? 0)) > 0.01 || !(received > 0)) {
      return { kind: "owner", why: "в обмене не видно прихода DARAI" };
    }
    return { kind: "done", hash: step.hash!, received };
  }
  if (ok) return { kind: "done", hash: step.hash! };
  if (failed) return { kind: "retry", why: "перевод в сети упал — ничего не ушло" };
  return { kind: "wait" };
}

/** Без сети: шаг без байтов или вне окна — владельцу, слишком свежий — ждём. */
export function precheck(step: Step, now = Date.now()): Verdict | null {
  if (!step.tx || !step.hash || !step.nonce) return { kind: "owner", why: "нет подписанной транзакции — сверь кошелёк" };
  const age = now - Date.parse(step.at);
  if (!(age >= SETTLE_MS)) return { kind: "wait" };
  if (age > WINDOW_MS) return { kind: "owner", why: "старше 12 часов — сверь кошелёк" };
  return null;
}

/**
 * Разбор шага «sending» по сети. Может переслать те же подписанные байты —
 * поэтому звать только для пачки, уже забранной в работу (CAS). В базу не пишет.
 */
export async function judgeStep(step: Step, now = Date.now()): Promise<Verdict> {
  const pre = precheck(step, now);
  if (pre) return pre;
  const signer = process.env.NEAR_SIGNER_ACCOUNT_ID!;
  const { txOutcome } = await import("./batch-resolve");
  const found = await txOutcome(step.hash!);
  if (found) return judgeOutcome(step, found, signer);
  const { sendSigned } = await import("../../nearSafe");
  const r = await sendSigned(step.hash!, step.tx!);
  if (r.outcome) return judgeOutcome(step, r.outcome, signer);
  if (/InvalidNonce|Expired/.test(JSON.stringify(r.errorData ?? ""))) {
    const { txAbsentOnTwoProviders } = await import("../../rpc-absent");
    if (await txAbsentOnTwoProviders(step.hash!, signer)) return { kind: "retry", why: "сеть её не приняла — не ушла" };
  }
  return { kind: "wait" };
}

const STUCK_SQL = `SELECT id, bucket, status, steps, updated_at::text AS updated_at,
       (updated_at < now() - interval '15 minutes') AS idle
  FROM yuplink.money_batch
 WHERE bucket IN ('sub_usd', 'sub_usd_map', 'sub_burn', 'sub_dev', 'auc_darai', 'auc_usd', 'bank_usd')
   AND (status = 'failed' OR (status = 'running' AND updated_at < now() - interval '15 minutes'))
 ORDER BY created_at LIMIT 5;`;

/** Забрать пачку в работу по прочитанному состоянию: второй воркер и админка её не возьмут. */
async function take(b: Row): Promise<boolean> {
  const rows = (await mcpExec(
    `UPDATE yuplink.money_batch SET status = 'running', updated_at = now()
      WHERE id = ${sqlStr(b.id)} AND status = ${sqlStr(b.status)}
        AND updated_at = ${sqlStr(b.updated_at)}::timestamptz
      RETURNING id;`,
  )) as unknown[] | null;
  return !!rows?.length;
}

/** Ничего не решили — вернуть пачку во «встала» (ошибка прежняя). */
export async function releaseBatch(id: string): Promise<void> {
  await mcpExec(
    `UPDATE yuplink.money_batch SET status = 'failed', updated_at = now()
      WHERE id = ${sqlStr(id)} AND status = 'running';`,
  );
}

async function notify(text: string): Promise<void> {
  const { sendTgMessageToAdmins } = await import("../../tg");
  await sendTgMessageToAdmins(text).catch(() => {});
}

async function healOne(b: Row): Promise<void> {
  const steps = b.steps ?? [];
  const names = [...new Set(steps.map((s) => s.name))];
  const flying = names.map((n) => stepOf(steps, n)!).filter((s) => s.state === "sending");
  const { runBatch } = await import("./batch");
  if (flying.length === 0) {
    const n = resumes.get(b.id) ?? 0;
    if (!b.idle || n >= MAX_RESUMES) return;
    if (!(await take(b))) return;
    resumes.set(b.id, n + 1);
    await runBatch(b.id).catch(() => {});
    return;
  }
  const step = flying[0];
  const toOwner = async (why: string) => {
    if (shouldNotify(`heal:${b.id}`)) {
      await notify(`⚠️ Подписки: пачка ${b.bucket} (${b.id}), шаг «${step.name}»: ${why}. Нужен разбор вручную.`);
    }
  };
  const pre = precheck(step);
  if (pre?.kind === "owner") return toOwner(pre.why);
  if (pre) return;
  // Сперва забрать пачку, потом трогать сеть: пересылка байтов — только своей пачки.
  if (!(await take(b))) return;
  let v = await judgeStep(step).catch((): Verdict => ({ kind: "wait" }));
  const retries = steps.filter((s) => s.name === step.name && s.state === "retry").length;
  if (v.kind === "retry" && retries >= MAX_RESUMES) v = { kind: "owner", why: `${v.why}; повторов уже ${retries}` };
  if (v.kind === "wait" || v.kind === "owner") {
    await releaseBatch(b.id);
    if (v.kind === "owner") await toOwner(v.why);
    return;
  }
  if (v.kind === "done") {
    await pushStep(b.id, { name: step.name, state: "done", amount: step.amount, hash: v.hash, received: v.received });
    await notify(`🔧 Подписки: пачка ${b.bucket} (${b.id}) — шаг «${step.name}» прошёл в сети, продолжаю`);
  } else {
    await pushStep(b.id, { name: step.name, state: "retry", amount: step.amount });
    await notify(`🔧 Подписки: пачка ${b.bucket} (${b.id}) — шаг «${step.name}»: ${v.why}, отправляю заново`);
  }
  await runBatch(b.id).catch(() => {});
}

/** Пройти вставшие пачки по очереди. Сбой одной не мешает остальным. */
export async function healStuckBatches(): Promise<void> {
  const rows = ((await mcpExec(STUCK_SQL, { wrapJson: true })) ?? []) as Row[];
  for (const b of rows) {
    await healOne(b).catch((e) => console.warn(`[esub] разбор ${b.id}:`, e instanceof Error ? e.message : e));
  }
}
