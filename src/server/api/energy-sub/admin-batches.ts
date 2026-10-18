// Пачки рассылки в админке: «Распределить сейчас», продолжить вставшую,
// закрыть вручную. Только владелец.
//
// «Зависшая» — пачка «идёт» дольше 15 минут: процесс умер посреди рассылки,
// статус некому поменять. Её можно продолжить или закрыть, как вставшую.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { requirePayoutsAdmin } from "../../auth";
import { runBatch, runDueBatches } from "./batch";
import { KINDS } from "./batch-kinds";
import { setStatus } from "./batch-steps";
import { BATCH_VIEW_SQL, type BatchView } from "./admin";
import { FREE_BUCKET } from "../autodist/free-darai";
import { batchNeedsHands } from "@/lib/energySub";

const canHandle = (b: BatchView) => batchNeedsHands(b.status, String(b.updatedAt));

async function batchRow(id: string): Promise<BatchView | null> {
  const rows = (await mcpExec(`${BATCH_VIEW_SQL} WHERE id = ${sqlStr(id)};`, { wrapJson: true })) as
    | BatchView[]
    | null;
  return rows?.[0] ?? null;
}

/** «Распределить сейчас»: пачка по корзине подписки без ожидания порога. */
export const adminRunSubBatch = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ kind: z.enum(KINDS) }).parse(d))
  .handler(async ({ data }) => {
    const by = requirePayoutsAdmin();
    return { ids: await runDueBatches({ force: data.kind }, by) };
  });

/**
 * Продолжить пачку подписки с первого несделанного шага. Если шаг встал с
 * неизвестным исходом — сначала отметить, что было на самом деле (stuck).
 * Авторассылку «Раздачи DARAI» не продолжают: её недоплаченные видны в TG,
 * пачка только закрывается.
 */
export const adminResumeSubBatch = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().min(1).max(40),
        stuck: z
          .object({
            name: z.enum(["swap", "burn", "dev"]),
            sent: z.boolean(),
            hash: z.string().max(80).optional(),
          })
          .optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    requirePayoutsAdmin();
    const b = await batchRow(data.id);
    if (!b || !canHandle(b)) throw new Error("Продолжить можно только вставшую или зависшую пачку");
    if (b.bucket === FREE_BUCKET) throw new Error("Авторассылку DARAI не продолжают — только закрыть");
    // Забрать пачку одним запросом по прочитанному состоянию: вторая вкладка
    // (или ещё живой процесс, обновивший пачку) не продолжит её параллельно.
    const took = (await mcpExec(
      `UPDATE yuplink.money_batch SET status = 'running', updated_at = now()
        WHERE id = ${sqlStr(b.id)} AND status = ${sqlStr(b.status)}
          AND updated_at = ${sqlStr(String(b.updatedAt))}::timestamptz
        RETURNING id;`,
    )) as unknown[] | null;
    if (!took?.length) throw new Error("Пачку уже разбирают — обнови экран");
    if (data.stuck) {
      const { resolveStuckStep } = await import("./batch-resolve");
      try {
        await resolveStuckStep(b.id, b.steps ?? [], data.stuck);
      } catch (e) {
        // Не разобрали — пачка обратно во «встала», а не висит «идёт».
        const { releaseBatch } = await import("./batch-heal");
        await releaseBatch(b.id);
        throw e;
      }
    }
    await runBatch(b.id);
    return { ok: true as const };
  });

/**
 * Закрыть пачку вручную (владелец проверил кошелёк сам). У пачки подписки без
 * шагов деньги возвращаются в корзину; были шаги — пачка считается разосланной.
 * Авторассылка DARAI корзин не трогала — возвращать нечего.
 */
export const adminCloseSubBatch = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().min(1).max(40), note: z.string().max(300) }).parse(d),
  )
  .handler(async ({ data }) => {
    requirePayoutsAdmin();
    const b = await batchRow(data.id);
    if (!b || !canHandle(b)) throw new Error("Закрыть можно только вставшую или зависшую пачку");
    if (b.bucket !== FREE_BUCKET && (b.steps ?? []).length === 0) {
      await mcpExec(
        `INSERT INTO yuplink.money_bucket_move (id, bucket, token, amount, kind, ref, note)
         VALUES (${sqlStr(`mbm_undo_${b.id}`)}, ${sqlStr(b.bucket)}, ${sqlStr(b.token)},
                 ${Number(b.amount).toFixed(8)}, 'adjust', ${sqlStr(`batch:${b.id}:undo`)},
                 'пачка отменена до отправки')
         ON CONFLICT (ref) DO NOTHING;`,
      );
    }
    await setStatus(b.id, "closed", data.note || b.error);
    return { ok: true as const };
  });
