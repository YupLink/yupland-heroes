// Пачки корзин подписки: порог набран (или нажата кнопка) → деньги уходят.
// Пороги и режимы — autodist/rules.ts.
//
//  · «$ → карта» (sub_usd_map — 30 % USDT-оплат): сразу после покупки, без
//    порога — обмен на DARAI, весь приход в пул карты (владелец, 03.10);
//  · «$» (sub_usd — 70 % USDT-оплат): по порогу — 50 из 70 разработчикам в
//    USDT как есть, 20 из 70 меняются на DARAI и ложатся в пул сжигания.
//  · «Сжечь» (sub_burn) — пул сжигания: в дупло одной транзакцией от 250 млн
//    (burn-pool.ts, §8.68). «Разработчики» (sub_dev): DARAI по долям.
//  · «Аукционы» (auc_darai / auc_usd): выигрыши лотов админа — целиком
//    разработчикам по долям, своим порогом (владелец, 14.10). Виды — batch-kinds.ts.
//
// Открытие пачки — одним запросом: сумма берётся из корзины В ЭТОМ ЖЕ запросе
// (не из прочитанного раньше баланса), строка пачки + минус суммы из корзины.
// Незакрытая пачка на корзину одна (уникальный индекс): второй процесс, пришедший
// в ту же секунду, просто не откроет свою, а пришедший позже увидит уже
// уменьшенную корзину — одну сумму дважды не разослать.
import { nanoid } from "nanoid";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { SPLIT, USD_BUCKET_DEV_SHARE, usdBatchPlan } from "@/lib/energySub";
import { bucketBalances } from "./buckets";
import { loadDist, type DistSettings } from "../autodist/rules";
import { firstRow } from "./grant";
import { revertIfUntouched, shouldNotify } from "./batch-revert";
import { BURN_POOL_MIN, creditBurnPool } from "./burn-pool";
import {
  BURN_WALLET,
  batchSummary,
  DARAI_FT,
  USDT_FT,
  pushSendingStep,
  pushStep,
  sendDevOnce,
  sendOnce,
  setStatus,
  stepOf,
  type Step,
} from "./batch-steps";

import {
  BATCH_LIMITS,
  BUCKET_OF,
  KIND_OF,
  SWAP_MIN,
  isSwapKind,
  tokenOf,
  type Kind,
} from "./batch-kinds";

export { BATCH_LIMITS, type Kind } from "./batch-kinds";

export function openBatchSql(kind: Kind, id: string, by: string): string {
  const bucket = BUCKET_OF[kind];
  const token = tokenOf(kind);
  const { cap, min } = BATCH_LIMITS[kind];
  // USDT — 6 знаков, DARAI — 8 (как в журнале корзин): округление только вниз.
  const dp = token === "USDT" ? 6 : 8;
  const take = cap == null ? "bal.v" : `LEAST(bal.v, ${cap.toFixed(8)})`;
  return `
WITH bal AS (
  SELECT COALESCE(sum(amount), 0) AS v FROM yuplink.money_bucket_move WHERE bucket = ${sqlStr(bucket)}
), b AS (
  INSERT INTO yuplink.money_batch (id, bucket, token, amount, status, created_by)
  SELECT ${sqlStr(id)}, ${sqlStr(bucket)}, ${sqlStr(token)}, trunc(${take}, ${dp}), 'running', ${sqlStr(by)}
    FROM bal
   WHERE trunc(${take}, ${dp}) >= ${min.toFixed(8)}${
     isSwapKind(kind)
       ? `
     -- обмены на Ref — по одному: один подписант, второй параллельный упал бы
     AND NOT EXISTS (SELECT 1 FROM yuplink.money_batch
                      WHERE bucket IN ('sub_usd', 'sub_usd_map', 'bank_usd') AND status = 'running')`
       : ""
   }
  ON CONFLICT DO NOTHING
  RETURNING id, bucket, token, amount
), m AS (
  INSERT INTO yuplink.money_bucket_move (id, bucket, token, amount, kind, ref, note)
  SELECT 'mbm_' || b.id, b.bucket, b.token, -b.amount, 'batch', 'batch:' || b.id, 'пачка'
    FROM b
  RETURNING 1
)
SELECT row_to_json(_t.*) AS _row FROM (SELECT (SELECT id FROM b) AS id) _t;`;
}

/** Открыть пачку на всё, что сейчас в корзине (с потолком). null — нечего или уже открыта. */
export async function openBatch(kind: Kind, by: string): Promise<string | null> {
  const rows = await mcpExec(openBatchSql(kind, `mb_${nanoid(12)}`, by));
  return firstRow<{ id: string | null }>(rows)?.id ?? null;
}

type BatchRow = { id: string; bucket: string; amount: number; steps: Step[] };

async function execute(b: BatchRow, dist: DistSettings): Promise<void> {
  const kind = KIND_OF[b.bucket];
  const steps = b.steps ?? [];
  const amount = Number(b.amount);
  if (kind === "burn") {
    await sendOnce(b.id, steps, "burn", DARAI_FT, BURN_WALLET, amount);
    return;
  }
  if (kind === "dev" || kind === "auc_darai" || kind === "auc_usd") {
    const ft = kind === "auc_usd" ? USDT_FT : DARAI_FT;
    await sendDevOnce(b.id, steps, ft, dist.devWallets, amount);
    return;
  }
  if (!isSwapKind(kind)) throw new Error(`Пачка ${b.bucket}: неизвестная корзина`);
  // «$ → карта»: весь обмен в пул карты. Корзина $: разработчикам USDT, обмен — в дупло.
  const plan = usdBatchPlan(amount, kind === "usd" ? USD_BUCKET_DEV_SHARE : 0);
  const mapShare = kind === "usd_map" ? 1 : 0;
  let swap = stepOf(steps, "swap");
  if (!swap || swap.state === "retry") {
    const { swapUsdtToDaraiCore } = await import("../ref-swap-core");
    // «sending» — прямо перед подписью: сбой котировки или проверки баланса
    // не оставит шаг с неизвестным исходом.
    const r = await swapUsdtToDaraiCore(plan.swap, (hash, m) =>
      pushSendingStep(b.id, { name: "swap", amount: plan.swap, hash, nonce: m.nonce, tx: m.signedTx }),
    );
    await pushStep(b.id, { name: "swap", state: "done", amount: plan.swap, hash: r.hash, received: r.received });
    swap = { name: "swap", state: "done", hash: r.hash, received: r.received, at: "" };
  }
  if (swap.state === "sending" && swap.tx) throw new Error("Обмен: исход неизвестен — сверю с сетью сам");
  if (swap.state !== "done" || !(Number(swap.received) > 0)) {
    throw new Error("Обмен: приход DARAI не виден — найди транзакцию и отметь обмен по хэшу");
  }
  const received = Number(swap.received);
  // «$ → откуп золота» (лицензии банка): весь обмен — в откуп из пула банка.
  if (kind === "bank_usd") return (await import("../bank/bank-buyback")).creditSwapToBuyback(b.id, steps, received);
  const toMap = mapShare === 1 ? received : 0;
  if (toMap > 0 && stepOf(steps, "map")?.state !== "done") {
    const { insertPoolMove } = await import("../darai-pools-move");
    await insertPoolMove({
      pool: "map",
      kind: "adjust",
      amount: toMap,
      ref: `batch:${b.id}:map`,
      note: "подписки: доля карты после обмена",
    });
    await pushStep(b.id, { name: "map", state: "done", amount: toMap });
  }
  await creditBurnPool(b.id, steps, received - toMap);
  await sendDevOnce(b.id, steps, USDT_FT, dist.devWallets, plan.dev);
}

async function notify(text: string): Promise<void> {
  const { sendTgMessageToAdmins } = await import("../../tg");
  await sendTgMessageToAdmins(text).catch(() => {});
}

const sourceOf = (bucket: string) => (bucket.startsWith("auc_") ? "Аукционы" : "Подписки");

/** Выполнить (или продолжить) пачку. Ошибка — пачка «failed», деньги ждут в ней. */
export async function runBatch(id: string): Promise<void> {
  const rows = ((await mcpExec(
    `SELECT id, bucket, amount, steps FROM yuplink.money_batch WHERE id = ${sqlStr(id)};`,
    { wrapJson: true },
  )) ?? []) as BatchRow[];
  const b = rows[0];
  if (!b) throw new Error("Пачка не найдена");
  try {
    await execute(b, await loadDist());
    await setStatus(id, "done");
    // Шаги — свежие из базы: в b.steps то, что было до запуска.
    const fresh = ((await mcpExec(`SELECT steps FROM yuplink.money_batch WHERE id = ${sqlStr(id)};`, {
      wrapJson: true,
    }).catch(() => null)) ?? []) as Array<{ steps: Step[] }>;
    await notify(`✅ ${sourceOf(b.bucket)} · ${batchSummary(b.bucket, Number(b.amount), fresh[0]?.steps ?? b.steps ?? [])} (${id})`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Ни одного шага — ни один перевод и обмен не начинался (шаг «sending»
    // пишется прямо перед подписью). Такую пачку безопасно откатить в корзину:
    // следующая проверка попробует снова, а корзина не стоит до ручного разбора.
    if (await revertIfUntouched(id, msg)) {
      if (shouldNotify(b.bucket)) await notify(`⚠️ ${sourceOf(b.bucket)}: пачка ${b.bucket} не ушла, повторю сама: ${msg}`);
      throw e;
    }
    await setStatus(id, "failed", msg);
    await notify(`⚠️ ${sourceOf(b.bucket)}: пачка ${b.bucket} (${id}) встала: ${msg}`);
    throw e;
  }
}

/** Сколько USDT-оплат стоит за корзиной $ (в ней 70 % оплаты). */
export function usdIncomeOf(bal: { sub_usd: number }): number {
  return bal.sub_usd / (SPLIT.USDT.burn + SPLIT.USDT.dev);
}

/** Сколько DARAI-оплат стоит за корзинами «Сжечь» и «Разработчикам» (15 % + 25 %). */
export function daraiIncomeOf(bal: { sub_burn: number; sub_dev: number }): number {
  return (bal.sub_burn + bal.sub_dev) / (SPLIT.Darai.burn + SPLIT.Darai.dev);
}

let dueRun: Promise<string[]> | null = null;

/**
 * Что пора разослать. auto — только корзины в режиме «авто» с набранным
 * порогом. Один прогон на процесс: второй вызов ждёт первый.
 */
export function runDueBatches(trigger: "auto" | { force: Kind }, by = "auto"): Promise<string[]> {
  const run = (async () => {
    if (dueRun) await dueRun.catch(() => {});
    return runDue(trigger, by);
  })();
  const mine = run.finally(() => {
    if (dueRun === mine) dueRun = null;
  });
  dueRun = mine;
  return mine;
}

async function runDue(trigger: "auto" | { force: Kind }, by: string): Promise<string[]> {
  // Вставшие пачки — сначала: сверка с сетью и продолжение (batch-heal.ts).
  if (trigger === "auto") {
    const { healStuckBatches } = await import("./batch-heal");
    await healStuckBatches().catch((e) => console.warn("[esub] разбор пачек:", e instanceof Error ? e.message : e));
    await (await import("../bank/license-money")).bookPendingLicenseMoney().catch(() => {});
  }
  const [{ rules }, bal] = await Promise.all([loadDist(), bucketBalances()]);
  const force = trigger === "auto" ? null : trigger.force;
  const auto = (m: "auto" | "manual") => trigger === "auto" && m === "auto";
  const daraiDue = auto(rules.sub_darai.mode) && daraiIncomeOf(bal) >= rules.sub_darai.threshold;
  const todo: Kind[] = [];
  // Доля карты с USDT-оплат — сразу, без порога и режима (владелец, 03.10).
  if (force === "usd_map" || (trigger === "auto" && bal.sub_usd_map >= SWAP_MIN)) todo.push("usd_map");
  if (force === "bank_usd" || (trigger === "auto" && bal.bank_usd >= SWAP_MIN)) todo.push("bank_usd");
  if (force === "usd" || (auto(rules.sub_usd.mode) && usdIncomeOf(bal) >= rules.sub_usd.threshold)) todo.push("usd");
  // Пул сжигания — своим порогом: одна транзакция в дупло от 250 млн (§8.68).
  if (force === "burn" || (auto(rules.sub_darai.mode) && bal.sub_burn >= BURN_POOL_MIN)) todo.push("burn");
  if (force === "dev" || daraiDue) todo.push("dev");
  // Аукционы админа — целиком разработчикам, свой порог по самой корзине.
  if (force === "auc_darai" || (auto(rules.auc_darai.mode) && bal.auc_darai >= rules.auc_darai.threshold)) {
    todo.push("auc_darai");
  }
  if (force === "auc_usd" || (auto(rules.auc_usd.mode) && bal.auc_usd >= rules.auc_usd.threshold)) {
    todo.push("auc_usd");
  }

  const done: string[] = [];
  for (const kind of todo) {
    const id = await openBatch(kind, by);
    if (!id) continue; // пусто, мало или у корзины уже есть незакрытая пачка
    done.push(id);
    await runBatch(id).catch(() => {});
  }
  return done;
}
