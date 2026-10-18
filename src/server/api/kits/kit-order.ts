// Бронь набора и её судьба: забронировать (до денег), оплатить (kit_pay — под
// замком брони, пока она «reserved»), выдать (подарком, одним запросом с
// отметкой «выдано» и деньгами по корзинам), снять (единица — назад в тираж и
// лимит, списанное по брони — назад на счёт, одной транзакцией в kit_release).
//
// Каждый шаг переживает слепой повтор моста: бронь ищется по ключу нажатия,
// оплата — ключ счёта, выдача и снятие — CAS по статусу брони. Оплата и снятие
// берут замок брони первым: запоздавшая оплата снятую бронь не оплатит.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { firstRow } from "../energy-sub/grant";
import { isKitToken, type KitToken } from "@/lib/kits";
import { grantSql } from "./kit-grant-sql";

export type KitOrderStatus = "reserved" | "granted" | "released";

/** Бронь — снимок того, что игрок оплачивает. */
export type KitOrder = {
  id: string;
  status: KitOrderStatus;
  token: KitToken;
  /** Сумма к оплате в валюте token. */
  amount: number;
  priceUsd: number;
  boxId: string;
  boxCount: number;
  payRef: string;
};

type ReserveRow = {
  r_id: string | null;
  r_status: string;
  r_token: string;
  r_amount: number | string;
  r_price_usd: number | string;
  r_box_id: string;
  r_box_count: number | string;
};

/** Отказы брони из SQL → ключи словаря (до денег, игрок ничего не потратил). */
const REFUSAL = /\bkit_(not_found|off|price_changed|changed|sold_out|limit)\b/;

const statusOf = (v: unknown): KitOrderStatus =>
  v === "granted" || v === "released" ? v : "reserved";

/** Цена набора в $ сейчас; null — набора нет. */
export async function kitPriceUsd(kitId: string): Promise<number | null> {
  const rows = (await mcpExec(`SELECT price_usd FROM yuplink.kit WHERE id = ${sqlStr(kitId)};`, {
    wrapJson: true,
  })) as Array<{ price_usd: number | string }> | null;
  const v = Number(rows?.[0]?.price_usd);
  return rows?.[0] && v > 0 ? v : null;
}

export async function reserveKit(o: {
  kitId: string;
  account: string;
  wallet: string;
  payRef: string;
  token: KitToken;
  /** Сумма к оплате — сервер посчитал её по цене priceUsd. */
  amount: number;
  /** Цена набора в $, по которой считана сумма: уже другая — отказ. */
  priceUsd: number;
  /** Бокс и количество, которые игрок видел: набор уже другой — отказ. */
  boxId: string;
  boxCount: number;
}): Promise<KitOrder> {
  let rows: ReserveRow[];
  try {
    rows = (await mcpExec(
      `SELECT * FROM yuplink.kit_reserve(${sqlStr(o.kitId)}, ${sqlStr(o.account)},
         ${sqlStr(o.wallet)}, ${sqlStr(o.payRef)}, ${sqlStr(o.token)}, ${o.amount.toFixed(8)},
         ${o.priceUsd.toFixed(2)}, ${sqlStr(o.boxId)}, ${Math.trunc(o.boxCount)});`,
      { wrapJson: true },
    )) as ReserveRow[];
  } catch (e) {
    const m = REFUSAL.exec(e instanceof Error ? e.message : String(e));
    if (m) throw new Error(`kits.err_${m[1]}`);
    throw e;
  }
  const r = rows?.[0];
  if (!r?.r_id || !isKitToken(r.r_token)) throw new Error("kits.err_not_found");
  return {
    id: r.r_id,
    status: statusOf(r.r_status),
    token: r.r_token,
    amount: Number(r.r_amount) || 0,
    priceUsd: Number(r.r_price_usd) || 0,
    boxId: String(r.r_box_id ?? ""),
    boxCount: Number(r.r_box_count) || 1,
    payRef: o.payRef,
  };
}

/**
 * Оплатить бронь со счёта (kit_pay): под замком брони и только пока она
 * «reserved», сумма — из снимка брони. Повтор ничего второй раз не спишет.
 * Отказы приходят сырыми кодами SQL (not_enough_currency, kit_released) —
 * в ключи словаря их переводит kit-buy.ts.
 */
export async function payOrder(id: string): Promise<{ applied: boolean }> {
  const rows = (await mcpExec(`SELECT * FROM yuplink.kit_pay(${sqlStr(id)});`, {
    wrapJson: true,
  })) as Array<{ r_status: string; r_applied: boolean }>;
  return { applied: rows?.[0]?.r_applied === true };
}

export async function orderStatus(id: string): Promise<KitOrderStatus | null> {
  const rows = (await mcpExec(`SELECT status FROM yuplink.kit_order WHERE id = ${sqlStr(id)};`, {
    wrapJson: true,
  })) as Array<{ status: string }>;
  return rows?.[0] ? statusOf(rows[0].status) : null;
}

/**
 * Выдать набор. Не бросила — набор выдан (этим вызовом или повтором раньше).
 * Бросила — бронь не выдана: не оплачена, снята или запрос сорвался.
 */
export async function grantOrder(order: KitOrder): Promise<void> {
  // БЕЗ обёртки wrapJson: изменяющие CTE обязаны стоять на верхнем уровне.
  const r = firstRow<{ granted: number | string }>(await mcpExec(grantSql(order)));
  if (Number(r?.granted) > 0) return;
  // Отметка не встала: её уже поставил повтор — или бронь не оплачена/снята.
  if ((await orderStatus(order.id)) === "granted") return;
  throw new Error("kits.err_retry");
}

/** Снять бронь (и вернуть списанное). Итоговый статус: 'granted' — уже выдана. */
export async function releaseOrder(id: string): Promise<KitOrderStatus> {
  const rows = (await mcpExec(`SELECT * FROM yuplink.kit_release(${sqlStr(id)});`, {
    wrapJson: true,
  })) as Array<{ r_status: string }>;
  return statusOf(rows?.[0]?.r_status);
}
