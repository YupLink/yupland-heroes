// «Разобрать» свою постройку в мире строителей: назад половина цены покупки
// (lib/buildingSale DISMANTLE_REFUND_PCT, владелец 05.11.2026).
//
// Ферма: героев снимаем до оператора общим ядром снятия (хвост — каждому своему
// хозяину, без отдыха), целый урожай уезжает на склад рядом. Остался урожай
// (склада нет или полон) или на складе лежат товары — отказ: чужое не пропадает.
// Сам разбор — один оператор с ключом нажатия (bsale-dismantle-sql). Возврат —
// теми же функциями, что откат цены маркета, ключ строки — от ключа нажатия.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { dismantleRefund, type RefundLine } from "@/lib/buildingSale";
import { parseFieldConfig } from "@/lib/fieldConfig";
import type { MarketPriceResource } from "@/lib/marketItem";
import { sqlRow } from "@/server/api/beta-raid/chest/chest-row";
import { pchestActor } from "@/server/api/beta-raid/plain-chest/pchest-row";
import { requireOwnNear, type OwnBuilding } from "./bsale-own";
import { dismantleSql, dismantleVerdict, type DismantleRow } from "./bsale-dismantle-sql";

type Actor = { wallet: string; account: string; mapId: string };

export type Dismantled = { ok: true; refund: RefundLine[] };

async function priorRefund(op: string): Promise<RefundLine[] | null> {
  const rows = (await mcpExec(
    `SELECT refund FROM yuplink.raid_building_dismantle_op WHERE op = ${sqlStr(op)} LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ refund: unknown }> | null;
  if (!rows?.[0]) return null;
  const v = typeof rows[0].refund === "string" ? JSON.parse(rows[0].refund) : rows[0].refund;
  return Array.isArray(v) ? (v as RefundLine[]) : [];
}

/**
 * Ферма: сначала урожай на склад рядом; остался целый (склада нет или полон) —
 * отказ ДО снятия героев (иначе хозяин сгонял бы чужих раз за разом). Потом —
 * снять всех героев (хвост каждому его хозяину) и вывезти то, что набежало.
 */
async function releaseField(a: Actor, q: number, r: number, own: OwnBuilding, op: string) {
  const field = parseFieldConfig(own.config) ?? parseFieldConfig(own.meta);
  const { settleFieldPayout } = await import("../field-settle");
  if (field) await settleFieldPayout(a.mapId, q, r, field);
  const at = `map_id = ${sqlStr(a.mapId)} AND q = ${q} AND r = ${r}`;
  const left = (await mcpExec(
    `SELECT 1 AS x FROM yuplink.raid_field_worker WHERE ${at} AND COALESCE(accrued, 0) >= 1 LIMIT 1;`,
    { wrapJson: true },
  )) as unknown[] | null;
  if (left?.length) throw new Error("bsale.dis_workers");
  const rows = (await mcpExec(
    `SELECT account_id, wallet, hero_id FROM yuplink.raid_field_worker
      WHERE ${at} AND hero_id IS NOT NULL;`,
    { wrapJson: true },
  )) as Array<{ account_id: string; wallet: string | null; hero_id: string }> | null;
  const { leaveFieldWork } = await import("../field-leave");
  for (const w of rows ?? []) {
    await leaveFieldWork({
      wallet: w.wallet ?? "",
      account: w.account_id,
      mapId: a.mapId,
      q,
      r,
      cfg: field,
      heroId: w.hero_id,
      key: `${op}:${w.hero_id}`,
    });
  }
  if (field) await settleFieldPayout(a.mapId, q, r, field);
}

/** Возврат забирает ровно один вызов (CAS paid_at): предметные строки цены не идемпотентны. */
async function claimRefund(op: string): Promise<RefundLine[] | null> {
  const rows = (await mcpExec(
    `UPDATE yuplink.raid_building_dismantle_op SET paid_at = now()
      WHERE op = ${sqlStr(op)} AND paid_at IS NULL
      RETURNING refund`,
    { wrapJsonCte: true },
  )) as Array<{ refund: unknown }> | null;
  if (!rows?.[0]) return null;
  const v = typeof rows[0].refund === "string" ? JSON.parse(rows[0].refund) : rows[0].refund;
  return Array.isArray(v) ? (v as RefundLine[]) : [];
}

/** Вернуть половину цены (если этот вызов её забрал). Провал строки — сигнал админам. */
async function payRefund(a: Actor, op: string): Promise<void> {
  const lines = await claimRefund(op);
  if (!lines) return;
  const { credit } = await import("../market-money");
  const { reportUndoFailure } = await import("../market-undo-alert");
  for (const [i, l] of lines.entries()) {
    const ref = `${op}:${i}`;
    const res = l.resource as MarketPriceResource;
    // Цену «в билетах» брали золотом ×500 (§8.61) — и возвращаем так же.
    const receipt = res === "tickets" ? { ticketsAsGold: true } : undefined;
    await credit(a.wallet, a.account, res, l.token, l.amount, ref, receipt).catch((e) =>
      reportUndoFailure(
        { ...a, side: "buy", res, token: l.token, amount: l.amount, spendRef: op, undoRef: ref },
        e,
      ),
    );
  }
}

/** Клетка опустела: реестр города и дельта всем, кто смотрит мир. */
async function announceGone(mapId: string, q: number, r: number, was: string | null) {
  try {
    const { ensureTownSchema, handleBuildingChange } = await import("../town-resolve");
    await ensureTownSchema();
    await handleBuildingChange(mapId, q, r, was, null);
  } catch (e) {
    console.warn("[bsale-dismantle] реестр города:", e instanceof Error ? e.message : e);
  }
  try {
    const { purgeMapBase } = await import("../map-base");
    purgeMapBase(mapId);
    // Разобранный склад не должен принимать урожай из кэша складов (30 с).
    (await import("../warehouse-map-cells")).forgetWarehouseCells(mapId);
    const { noteAdminPatches } = await import("../map-change-hooks");
    const patch = { q, r, buildingId: null, buildingSkinId: null, buildingConfig: null, tier: 0 };
    await noteAdminPatches(mapId, [patch], { edit: false });
  } catch (e) {
    console.warn("[bsale-dismantle] рассылка не прошла:", e instanceof Error ? e.message : e);
  }
}

export const dismantleBuilding = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        q: z.number().int(),
        r: z.number().int(),
        op: z.string().regex(/^[A-Za-z0-9_-]{6,64}$/),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<Dismantled> => {
    const a = await pchestActor("bsale-dismantle");
    const op = `bsdis:${a.account}:${data.op}`;
    // Повтор нажатия: разбор уже был — доплатить возврат, если его ещё никто не забрал.
    const done = await priorRefund(op);
    if (done) {
      await payRefund(a, op);
      return { ok: true, refund: done };
    }
    const own = await requireOwnNear(a, data.q, data.r);
    if (own.effect === "field") await releaseField(a, data.q, data.r, own, op);
    const refund = dismantleRefund(own.price);

    let row: DismantleRow | null = null;
    let failed: unknown = null;
    try {
      const sql = dismantleSql({ ...a, q: data.q, r: data.r, placeOp: own.placeOp, op, refund });
      row = sqlRow<DismantleRow>((await mcpExec(sql)) as unknown[]) ?? null;
    } catch (e) {
      failed = e;
    }
    // Разобрали сейчас или обрыв после коммита (судит ключ нажатия).
    const again = row?.done ? refund : await priorRefund(op).catch(() => null);
    if (again) {
      await announceGone(a.mapId, data.q, data.r, row?.building ?? own.buildingId);
      await payRefund(a, op);
      return { ok: true, refund: again };
    }
    if (failed) throw failed;
    throw new Error(dismantleVerdict(row));
  });
