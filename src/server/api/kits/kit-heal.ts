// Самопочинка броней наборов.
//
// Процесс может упасть между деньгами и выдачей: выкат перезапускает
// приложение, и покупка в полёте обрывается. А неясный сбой оплаты (таймаут
// моста) бронь нарочно не снимает (kit-buy.ts). Бронь тогда висит «reserved»
// — деньги списаны, набора нет (или наоборот: денег нет, а единица тиража
// занята). Раз в 10 минут каждая бронь старше 10 минут доводится до конца:
// оплачена — выдаём набор (выдача сама проверяет оплату), не вышло — снимаем
// бронь, и kit_release возвращает списанное, если оно было.
//
// Вторая сеть — снятые брони, по ключу которых деньги списаны, но не
// возвращены (так быть не должно: kit_pay под замком брони снятую не оплатит,
// а kit_release снимает и возвращает разом; это страховка на всякий сбой
// функций): kit_release по снятой брони просто вернёт деньги.
//
// Часы живут внутри процесса, как зачистка подарков (gifts-expire.ts), и
// стартуют лениво с витрины наборов. Воркеров бывает два — это безопасно:
// выдача и снятие — CAS по статусу брони, возврат — по ключу, второй просто
// ничего не найдёт.
import { mcpExec } from "../../db/mcpClient";
import { isKitToken } from "@/lib/kits";
import { grantOrder, releaseOrder, type KitOrder } from "./kit-order";

const EVERY_MS = 10 * 60_000;

type StaleRow = {
  id: string;
  status: string;
  token: string;
  amount: number | string;
  price_usd: number | string;
  box_id: string;
  box_count: number | string;
  pay_ref: string;
};

const STALE_SQL = `SELECT o.id, o.status, o.token, o.amount, o.price_usd, o.box_id, o.box_count,
       o.pay_ref
  FROM yuplink.kit_order o
 WHERE (o.status = 'reserved' AND o.created_at < now() - interval '10 minutes')
    OR (o.status = 'released' AND o.updated_at > now() - interval '30 days'
        AND EXISTS (SELECT 1 FROM yuplink.acc_ledger l
                     WHERE l.kind = 'acc_spend' AND l.ref = o.pay_ref)
        AND NOT EXISTS (SELECT 1 FROM yuplink.acc_ledger l
                         WHERE l.kind = 'acc_refund' AND l.ref = o.pay_ref || '-undo'))
 ORDER BY o.created_at LIMIT 20;`;

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Довести зависшие брони. Возвращает, сколько разобрано. */
export async function healKitOrders(): Promise<number> {
  const rows = ((await mcpExec(STALE_SQL, { wrapJson: true })) ?? []) as StaleRow[];
  let done = 0;
  for (const r of rows) {
    if (!isKitToken(r.token)) continue;
    const order: KitOrder = {
      id: r.id,
      status: "reserved",
      token: r.token,
      amount: Number(r.amount) || 0,
      priceUsd: Number(r.price_usd) || 0,
      boxId: String(r.box_id ?? ""),
      boxCount: Number(r.box_count) || 1,
      payRef: r.pay_ref,
    };
    // Висящую бронь сначала пробуем выдать (выдача сама проверит оплату);
    // снятую с невозвращёнными деньгами — сразу к возврату (kit_release).
    if (r.status === "reserved") {
      try {
        await grantOrder(order);
        done++;
        continue;
      } catch {
        // Не оплачена или выдача не встаёт — снимаем бронь (с возвратом денег).
      }
    }
    try {
      await releaseOrder(order.id);
      done++;
    } catch (e) {
      console.warn("[kits] самопочинка: бронь не снялась:", order.id, msg(e));
    }
  }
  if (done > 0) console.log(`[kits] самопочинка: разобрано броней ${done}`);
  return done;
}

let timer: ReturnType<typeof setInterval> | null = null;

/** Включить часы самопочинки (один раз на процесс; первый прогон — сразу). */
export function startKitHealer(): void {
  if (timer || typeof setInterval !== "function") return;
  // Только сервер: модуль тянет мост к базе.
  if (!import.meta.env.SSR) return;
  const run = () =>
    void healKitOrders().catch((e) => console.warn("[kits] самопочинка не прошла:", msg(e)));
  timer = setInterval(run, EVERY_MS);
  (timer as unknown as { unref?: () => void }).unref?.();
  run();
}
