// Тяжёлый разбор сирот — всё, что НЕ трогает живые деньги напрямую.
//
// Почему отдельно от роутера крона. Шагов десять, каждый ходит и в Sendler, и в
// базу, и вместе они не укладываются в таймаут прокси: запрос обрывался на
// 502, а шаги в хвосте не выполнялись НИКОГДА. Деньги из этой цепочки уже
// вынесены вперёд и идут синхронно; здесь остаётся долгая часть, которую крон
// запускает и не ждёт.
//
// Замер каждого шага — не украшение: без него «крон висит» невозможно
// разложить на «кто именно висит».
export type SweepResult = Record<string, unknown> & { ms: Record<string, number> };

/** Один шаг: своя ошибка его не роняет соседей, время пишется всегда. */
async function step<T>(
  name: string,
  ms: Record<string, number>,
  fallback: T,
  fn: () => Promise<T>,
): Promise<T> {
  const t0 = Date.now();
  // Отметка НА ВХОДЕ. Без неё зависший шаг не виден вовсе: запись о времени
  // делается на выходе, которого не наступает, и в логе просто тишина.
  console.log(`[sweep] → ${name}`);
  try {
    return await fn();
  } catch (e) {
    console.warn(`[sweep] ${name} упал:`, e instanceof Error ? e.message : e);
    return fallback;
  } finally {
    ms[name] = Date.now() - t0;
    // Долгий шаг называем СРАЗУ, а не в итоговой строке: если следующий шаг
    // повиснет, итога не будет вовсе, и виновника будет не найти.
    if (ms[name] >= 5000) {
      console.log(`[sweep] ${name}: ${(ms[name] / 1000).toFixed(1)}с`);
    }
  }
}

/** Один прогон разом. Повторный запуск отсекает гард в вызывающем коде. */
export async function runOrphanSweep(): Promise<SweepResult> {
  const ms: Record<string, number> = {};
  const t0 = Date.now();

  // ПЕРВОЙ — очередь ожидаемых зачислений. Это те, кому уже обещали «через
  // минуту»: игрок мог закрыть окно, и тогда довести обещание больше некому.
  const waits = await step("waits", ms, { checked: 0, settled: 0 }, async () => {
    const { settleDueCredits } = await import("./credit-wait");
    return await settleDueCredits(50);
  });

  const packs = await step("packs", ms, { delivered: 0, packs: 0 }, async () => {
    const { runPackOrphanReconcile } = await import("./lost-payments-packs");
    return await runPackOrphanReconcile();
  });

  const energy = await step("energy", ms, { delivered: 0, energy: 0 }, async () => {
    const { runEnergyOrphanReconcile } = await import("./lost-payments-energy");
    const r = await runEnergyOrphanReconcile();
    return { delivered: r.delivered, energy: r.energy };
  });

  const tickets = await step("tickets", ms, { credited: 0, tickets: 0 }, async () => {
    const { runTicketOrphanReconcile } = await import("./lost-payments-tickets");
    return await runTicketOrphanReconcile();
  });

  const unspent = await step("unspent", ms, { delivered: 0, wallets: 0 }, async () => {
    const { runUnspentPackSettle } = await import("./lost-payments-unspent");
    return await runUnspentPackSettle();
  });

  const nftInputs = await step("nftInputs", ms, { scanned: 0, delivered: 0, boxes: 0 }, async () => {
    const { runNftInputOrphanReconcile } = await import("./chips");
    const r = await runNftInputOrphanReconcile();
    return { scanned: r.scanned, delivered: r.delivered, boxes: r.boxes };
  });

  const chipInputs = await step("chipInputs", ms, { scanned: 0, delivered: 0 }, async () => {
    const { runChipInputOrphanReconcile } = await import("./chips-mint-reconcile-input");
    const r = await runChipInputOrphanReconcile();
    return { scanned: r.scanned, delivered: r.delivered };
  });

  const nftInputStuck = await step("nftInputStuck", ms, { scanned: 0, granted: 0 }, async () => {
    const { runUnfinishedInputRecovery } = await import("./nft-input-stuck");
    const r = await runUnfinishedInputRecovery();
    return { scanned: r.scanned, granted: r.granted };
  });

  // Шаги вывода фишки в NFT (nftMints, stuckLocked) убраны вместе с самим
  // выводом (слово владельца 17.10.2026): незавершённых выводов на проде не было.

  ms.total = Date.now() - t0;
  const slow = Object.entries(ms)
    .filter(([k, v]) => k !== "total" && v >= 1000)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${(v / 1000).toFixed(1)}с`)
    .join(", ");
  console.log(
    `[sweep] разбор за ${(ms.total / 1000).toFixed(1)}с${slow ? ` · дольше секунды: ${slow}` : ""}`,
  );

  return { waits, packs, energy, tickets, unspent, nftInputs, chipInputs, nftInputStuck, ms };
}
