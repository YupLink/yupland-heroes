// Ручной запуск «веретеницы»: то же самое, что делает крон lost-payments,
// но без Bearer-секрета — по гейту requirePayoutsAdmin. Нужен, когда играть
// не хочется 30 мин до следующего срабатывания расписания.
import { createServerFn } from "@tanstack/react-start";
import { requirePayoutsAdmin } from "../auth";

export const adminForceLostPaymentsSweep = createServerFn({ method: "POST" }).handler(
  async () => {
    requirePayoutsAdmin();
    const t0 = Date.now();
    const stages: Record<string, unknown> = {};
    try {
      const { resolveStuckProcessing } = await import("./user-payouts-resolver");
      await resolveStuckProcessing();
      stages.resolve = "ok";
    } catch (e) {
      stages.resolve = String(e instanceof Error ? e.message : e);
    }
    try {
      const { runStuckPayoutRetry } = await import("./lost-payouts-retry");
      stages.retry = await runStuckPayoutRetry();
    } catch (e) {
      stages.retry = String(e instanceof Error ? e.message : e);
    }
    try {
      const { runAccountTopUpReconcile } = await import("./lost-payments-account");
      stages.topup = await runAccountTopUpReconcile();
    } catch (e) {
      stages.topup = String(e instanceof Error ? e.message : e);
    }
    try {
      const { runOrphanSweep } = await import("./lost-payments-sweep");
      stages.orphan = await runOrphanSweep();
    } catch (e) {
      stages.orphan = String(e instanceof Error ? e.message : e);
    }
    return { ok: true, durationMs: Date.now() - t0, stages };
  },
);
