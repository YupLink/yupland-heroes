// Добор оплаченных заготовок (ПРАВИЛА §8.59.7). Оплата прошла, выдача в рюкзак
// упала, откат тоже (мост сбоил тем же каналом), а игрок закрыл окно и унёс
// ключ нажатия — повторить некому. Тогда оплату доводит сервер: раз в минуту в
// каждом процессе (как mine-break-sweep), старт — с отдачей снимка карты
// (map-serve).
//
// Берём оплаты заготовок без возврата, старше SWEEP_AFTER_MIN минут, без ключа
// выдачи в рюкзак (craft-keys.ts), и делаем тот же откат, что и окно (craft-undo.ts):
// ключ выдачи запирается и оплата возвращается одним оператором — опоздавшая
// выдача после этого не ляжет, а успела лечь — откат ничего не вернёт.
// Процессов бывает несколько: ключ уникален, второй откат найдёт его запертым
// и ничего не вернёт.
//
// SWEEP_AFTER_MIN (craft-keys.ts) — дальше любой живой выдачи: мост повторяет
// запрос до 4 раз по 30 с, а выдача — несколько запросов подряд. Если добор
// всё же запер ключ под идущей выдачей или под повтором старого нажатия,
// выдача видит готовый ключ и ничего не кладёт; изготовление тогда перечитывает
// оплату и отвечает «попытка отменена», а не «в рюкзаке» (craft-core.ts).
// WITHIN_DAYS — страховка: начнут чистить журнал ключей выдачи — старая оплата
// без ключа ещё не значит «не выдана».
import { mcpExec } from "@/server/db/mcpClient";
import { DEPOSIT_OP_OF_ROW_SQL, PAY_OP_SHAPE_SQL, SWEEP_AFTER_MIN } from "./craft-keys";
import { undoDeposit } from "./craft-undo";

const EVERY_MS = 60_000;
const WITHIN_DAYS = 3;
/** Оплат за проход; остаток — следующей минутой. */
const BATCH = 50;

type DueRow = { pay_op?: unknown; bp_op?: unknown };

/** Оплаты заготовок, которые не легли и не вернулись: ключ оплаты и ключ выдачи. */
export function dueBlueprintsSql(limit: number): string {
  return `SELECT o.op_id AS pay_op, ${DEPOSIT_OP_OF_ROW_SQL} AS bp_op
  FROM yuplink.castle_architect_op o
 WHERE o.kind = 'blueprint' AND o.refunded_at IS NULL
   AND o.created_at < now() - interval '${SWEEP_AFTER_MIN} minutes'
   AND o.created_at > now() - interval '${WITHIN_DAYS} days'
   AND ${PAY_OP_SHAPE_SQL}
   AND NOT EXISTS (SELECT 1 FROM yuplink.raid_backpack_op b WHERE b.op = ${DEPOSIT_OP_OF_ROW_SQL})
 ORDER BY o.created_at
 LIMIT ${Math.max(1, Math.floor(limit))};`;
}

/** Один проход: вернуть зависшие оплаты. Отдаёт, сколько вернул именно он. */
export async function sweepBlueprints(): Promise<number> {
  const due = ((await mcpExec(dueBlueprintsSql(BATCH), { wrapJson: true })) ?? []) as DueRow[];
  let back = 0;
  for (const row of due) {
    const payOp = row?.pay_op;
    const bpOp = row?.bp_op;
    if (typeof payOp !== "string" || typeof bpOp !== "string") continue;
    try {
      // landed/gone — легла или вернул другой процесс: здесь делать нечего.
      if ((await undoDeposit(bpOp, payOp)) !== "refunded") continue;
      back++;
      console.warn("[architect] добор: оплата заготовки возвращена", payOp);
    } catch (e) {
      // Одна строка не мешает остальным; не прошла — следующей минутой.
      console.warn("[architect] добор: откат не прошёл", payOp, e instanceof Error ? e.message : e);
    }
  }
  return back;
}

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

async function pass(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await sweepBlueprints();
  } catch (e) {
    console.warn("[architect] добор не удался:", e instanceof Error ? e.message : e);
  } finally {
    running = false;
  }
}

/** Включить добор в этом процессе: раз в минуту, первый проход — сразу. */
export function startBlueprintSweeper(): void {
  if (timer || typeof setInterval !== "function") return;
  timer = setInterval(() => void pass(), EVERY_MS);
  (timer as unknown as { unref?: () => void }).unref?.();
  void pass();
}
