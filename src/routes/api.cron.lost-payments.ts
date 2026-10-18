// YUPLINK · Cron ПОТЕРЯННЫХ ПЛАТЕЖЕЙ (каждые 30 мин). Юзер платит on-chain, но
// фронт не докрутил серверный вызов → не зачислено. АВТО-ВЫДАЁМ молча (без TG).
//
// Порядок и режим — не косметика, а лечение реальной аварии.
//   • ДЕНЬГИ СИНХРОННО И ПЕРВЫМИ. Зависшие выплаты и пополнения счёта — два
//     коротких шага; они отрабатывают до ответа, и обрыв запроса им не страшен.
//   • РАЗБОР СИРОТ — ФОНОМ. Десять шагов с походами в Sendler не укладывались в
//     таймаут прокси: запрос падал в 502, и хвост цепочки не выполнялся НИКОГДА
//     (из-за этого пополнения ждали зачисления часами). Теперь крон запускает
//     разбор и не ждёт его, а гард не даёт двум прогонам наложиться.
// Ручная отладка: ?wait=1 — дождаться разбора и получить тайминги по шагам.
import { createFileRoute } from "@tanstack/react-router";
import { mcpExec } from "@/server/db/mcpClient";

// Порог = цена Football pack (самый дешёвый). Ниже — пыль, не алертим.
const THRESHOLD_DARAI = 50000;

/** Разбор идёт дольше интервала крона — второй прогон поверх первого не нужен. */
let sweepStartedAt = 0;
/** Но и вечным замок быть не должен: зависший прогон не имеет права закрыть
 *  разбор навсегда. Через час считаем предыдущий потерянным и идём заново. */
const SWEEP_STUCK_MS = 60 * 60_000;

async function startSweep(wait: boolean): Promise<unknown> {
  const running = sweepStartedAt > 0 && Date.now() - sweepStartedAt < SWEEP_STUCK_MS;
  if (running) {
    return { skipped: "уже идёт", секунд: Math.round((Date.now() - sweepStartedAt) / 1000) };
  }
  if (sweepStartedAt > 0) {
    console.warn(
      `[lost-payments] предыдущий разбор висит ${Math.round((Date.now() - sweepStartedAt) / 60000)} мин — запускаю новый`,
    );
  }
  sweepStartedAt = Date.now();
  const { runOrphanSweep } = await import("@/server/api/lost-payments-sweep");
  const p = runOrphanSweep().finally(() => {
    sweepStartedAt = 0;
  });
  if (wait) return await p;
  p.catch((e) => console.warn("[lost-payments] разбор упал:", e));
  return { started: true };
}

export const Route = createFileRoute("/api/cron/lost-payments")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const secret = process.env.CRON_SECRET;
        if (secret) {
          const auth = request.headers.get("authorization");
          if (auth !== `Bearer ${secret}`) {
            return new Response("unauthorized", { status: 401 });
          }
        }
        // Замер и денежной части: «крон висит» должно быть разложимо на шаг.
        const t0 = Date.now();
        const ms: Record<string, number> = {};
        const mark = (n: string) => {
          ms[n] = Date.now() - t0 - Object.values(ms).reduce((a, b) => a + b, 0);
        };
        try {
          // Разморозка залипших в processing: не долетевший бродкаст оставляет
          // заявку захваченной навсегда — резолвер запускался только когда
          // живой игрок открывал список выплат. Тут даём ему расписание: он
          // откатит «tx нет на цепочке» в pending, а следующий шаг переотправит.
          try {
            const { resolveStuckProcessing } = await import(
              "@/server/api/user-payouts-resolver"
            );
            await resolveStuckProcessing();
          } catch (e) {
            console.warn("[lost-payments] resolveStuckProcessing failed:", e);
          }
          mark("resolve");

          // Зависшие выплаты: заявка есть, деньги со счёта списаны, а перевод
          // не ушёл. Повторить её некому — конвейер запускает нажатие игрока,
          // а он нажал один раз и ушёл.
          let payouts = { sent: 0, failed: 0 };
          try {
            const { runStuckPayoutRetry } = await import("@/server/api/lost-payouts-retry");
            const r = await runStuckPayoutRetry();
            payouts = { sent: r.sent, failed: r.failed };
            if (r.sent > 0 || r.failed > 0) {
              console.log(`[lost-payments] выплаты: отправлено ${r.sent}, не вышло ${r.failed}`);
            }
            if (r.errors.length > 0) {
              console.warn("[lost-payments] зависшие выплаты:", r.errors.join(" | "));
            }
          } catch (e) {
            console.warn("[lost-payments] payout retry failed:", e);
          }
          mark("payouts");

          // Пополнения счёта: перевод с меткой «account top-up» прошёл, а
          // доклад клиента до сервера не дошёл.
          let account = { credited: 0 };
          try {
            const { runAccountTopUpReconcile } = await import("@/server/api/lost-payments-account");
            const r = await runAccountTopUpReconcile();
            account = { credited: r.credited };
            if (r.credited > 0) {
              console.log(`[lost-payments] пополнений зачтено: ${r.credited}`);
            }
          } catch (e) {
            console.warn("[lost-payments] account top-up reconcile failed:", e);
          }
          mark("account");

          // Пополнения пула карты: переводы с кошелька коллекции на склад.
          // Сканер живёт с августа, но его никто не звал — и отправленные на
          // склад 400 млн в пул не попали, а карта показывала перерасход при
          // живых деньгах (darai-pools-refresh).
          try {
            const { refreshPoolDeposits } = await import("@/server/api/darai-pools-refresh");
            await refreshPoolDeposits(true);
          } catch (e) {
            console.warn("[lost-payments] пул карты не обновился:", e);
          }
          mark("pool");

          // Билеты: чтение переключено на леджер, и ПРАВ теперь он. Сверка со
          // старой формулой оставлена только как измеритель: расхождение
          // ожидаемо (формула продолжает вычитать lifetimeSlotSpend и
          // totalClaimed, уже учтённые в леджере). Автоправку НЕ делаем — она
          // тянула бы баланс к неверной стороне.
          let ticketDrift = { accounts: 0, drift: 0 };
          try {
            const rows = (await mcpExec(
              `SELECT count(*)::int c, COALESCE(sum(drift),0)::float8 s FROM yuplink.v_tickets_drift;`,
              { wrapJson: true },
            )) as Array<{ c: number; s: number }>;
            ticketDrift = { accounts: rows?.[0]?.c ?? 0, drift: Number(rows?.[0]?.s ?? 0) };
          } catch (e) {
            console.warn("[lost-payments] ticket drift measure failed:", e);
          }
          mark("drift");

          // Алерт о застрявших выводах: если после разморозки и догона что-то
          // всё равно висит в processing дольше часа — админ должен узнать сам,
          // а не от игрока в личке. Раньше залипший вывод был невидим никому.
          try {
            const stuck = (await mcpExec(
              `SELECT count(*)::int c FROM yuplink.redemptions
                WHERE status = 'processing'
                  AND processing_started_at < now() - interval '1 hour';`,
              { wrapJson: true },
            )) as Array<{ c: number }>;
            const c = stuck?.[0]?.c ?? 0;
            if (c > 0) {
              const { sendTgMessageToAdmins } = await import("@/server/tg");
              await sendTgMessageToAdmins(
                `⚠️ Застрявших выводов: ${c} (в processing дольше часа). ` +
                  `Авто-разморозка не справилась — проверь заявки.`,
              );
            }
          } catch (e) {
            console.warn("[lost-payments] stuck-payout alert failed:", e);
          }
          mark("stuckAlert");

          const url = new URL(request.url);
          const wait = url.searchParams.get("wait") === "1";
          const sweep = await startSweep(wait);
          const result = wait ? await runLostPaymentsCheck() : { skipped: true };

          mark("sweepStart");
          console.log(
            `[lost-payments] деньги за ${((Date.now() - t0) / 1000).toFixed(1)}с · ` +
              Object.entries(ms).map(([k, v]) => `${k} ${(v / 1000).toFixed(1)}с`).join(", "),
          );
          return new Response(
            JSON.stringify({ ok: true, payouts, account, ticketDrift, sweep, ms, unspentDarai: result }),
            { headers: { "content-type": "application/json" } },
          );
        } catch (err) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: err instanceof Error ? err.message : String(err),
            }),
            { status: 500, headers: { "content-type": "application/json" } },
          );
        }
      },
    },
  },
});

async function runLostPaymentsCheck(): Promise<{
  found: number;
  totalDarai: number;
  wallets: Array<{ wallet: string; availDarai: number }>;
}> {
  // available DARAI по ТОЙ ЖЕ формуле, что в buy_chip_pack_atomic:
  //   redemptions(DARAI) + darai_deposits − chip_economy_spend
  const rows = (await mcpExec(
    `WITH w AS (SELECT DISTINCT wallet FROM yuplink.darai_deposits),
     bal AS (
       SELECT w.wallet,
         coalesce((SELECT sum(amount) FROM yuplink.redemptions r
                   WHERE r.wallet=w.wallet AND r.reward_token='DARAI' AND r.amount>0),0)
       + coalesce((SELECT sum(amount) FROM yuplink.darai_deposits d WHERE d.wallet=w.wallet),0)
       - coalesce((SELECT sum(amount) FROM yuplink.chip_economy_spend s WHERE s.wallet=w.wallet),0) AS avail
       FROM w)
     SELECT wallet, avail::float8 AS avail FROM bal
     WHERE avail >= ${THRESHOLD_DARAI} ORDER BY avail DESC`,
    { wrapJson: true },
  )) as Array<{ wallet: string; avail: number }>;

  if (!rows || rows.length === 0) return { found: 0, totalDarai: 0, wallets: [] };

  const total = rows.reduce((s, r) => s + Number(r.avail), 0);
  // НЕ шлём в TG. Это НЕ потерянные платежи, а НЕПОТРАЧЕННЫЙ баланс DARAI (юзер
  // внёс больше, чем потратил на паки — потратит остаток сам). Реальные пак-сироты
  // добивает runPackOrphanReconcile по memo.
  const wallets = rows.map((r) => ({
    wallet: r.wallet,
    availDarai: Math.round(Number(r.avail)),
  }));
  return { found: rows.length, totalDarai: total, wallets };
}
