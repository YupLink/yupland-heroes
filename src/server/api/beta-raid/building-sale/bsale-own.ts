// Своя постройка в мире строителей (lib/buildingSale): кто её поставил и что ему
// можно — разобрать за половину цены (bsale-dismantle) и подписать табличку
// (bsale-sign; владелец 05.11.2026: «табличку — кто поставил — может на ней
// что-то написать»). Только сервер: клиент сюда не ходит.
//
// Хозяин = последний не разобранный ключ установки клетки, и на клетке стоит
// постройка того же шаблона, что в его чертеже (админ мог снести и поставить своё).
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { cellBuildingEffect } from "@/lib/buildingEffect";
import {
  BUILDING_PLACE_RADIUS,
  dismantleRefund,
  placeDist,
  type OwnOffer,
  type RefundLine,
} from "@/lib/buildingSale";

export type OwnBuilding = {
  placeOp: string;
  account: string;
  price: RefundLine[] | null;
  buildingId: string;
  effect: string | null;
  config: Record<string, unknown> | null;
  /** meta шаблона — грядке без своей настройки (как fieldAt). */
  meta: unknown;
};

const parse = (v: unknown): unknown => (typeof v === "string" ? JSON.parse(v) : v);

/** Хозяин постройки клетки; не ставилась игроком или снесена — null. */
export async function ownBuildingAt(
  mapId: string,
  q: number,
  r: number,
): Promise<OwnBuilding | null> {
  const m = sqlStr(mapId);
  const rows = (await mcpExec(
    `SELECT x.op, x.account_id, x.price, c.building_id, c.building_config, t.meta, t.name
       FROM yuplink.raid_building_place_op x
       JOIN yuplink.raid_building_blueprint b ON b.id = x.blueprint_id
       JOIN yuplink.raid_map_cells c
         ON c.map_id = x.map_id AND c.q = x.q AND c.r = x.r AND c.building_id = b.building_id
       LEFT JOIN yuplink.mystic_item_template t ON t.id = c.building_id
      WHERE x.map_id = ${m} AND x.q = ${q} AND x.r = ${r} AND x.gone_at IS NULL
      ORDER BY x.created_at DESC LIMIT 1;`,
    { wrapJson: true },
  )) as Array<Record<string, unknown>> | null;
  const row = rows?.[0];
  if (!row) return null;
  const config = parse(row.building_config);
  const price = parse(row.price);
  return {
    placeOp: String(row.op),
    account: String(row.account_id),
    price: Array.isArray(price) ? (price as RefundLine[]) : null,
    buildingId: String(row.building_id),
    effect: cellBuildingEffect(config, parse(row.meta), String(row.name ?? "")),
    config: config && typeof config === "object" ? (config as Record<string, unknown>) : null,
    meta: parse(row.meta),
  };
}

/** Блок хозяина для окна постройки; не хозяин — null. Ошибку чтения не роняем в окно. */
export async function ownOffer(
  account: string | null,
  mapId: string,
  q: number,
  r: number,
): Promise<OwnOffer | null> {
  if (!account) return null;
  const own = await ownBuildingAt(mapId, q, r).catch(() => null);
  if (!own || own.account !== account) return null;
  const text = typeof own.config?.text === "string" ? own.config.text : "";
  return { refund: dismantleRefund(own.price), sign: own.effect === "sign", text };
}

/** Хозяин рядом со своей постройкой: иначе ключ отказа. */
export async function requireOwnNear(
  a: { wallet: string; account: string; mapId: string },
  q: number,
  r: number,
): Promise<OwnBuilding> {
  const { isBuilderWorld } = await import("@/server/api/beta-raid/land/builder-world");
  if (!(await isBuilderWorld(a.mapId))) throw new Error("bsale.not_builder_world");
  const own = await ownBuildingAt(a.mapId, q, r);
  if (!own || own.account !== a.account) throw new Error("bsale.not_owner");
  const { playerCell } = await import("@/server/api/beta-raid/encounter-where");
  const pos = await playerCell(a.wallet);
  if (placeDist(pos, { q, r }) > BUILDING_PLACE_RADIUS) throw new Error("bsale.far");
  return own;
}

/**
 * Хвост ключа оплаты тира: «:<ключ установки>» у постройки, что поставил игрок,
 * иначе пусто (ключи построек карты прежние). Без него разобрал и поставил на ту
 * же клетку — улучшение считалось бы уже оплаченным.
 */
export async function placeEpoch(mapId: string, q: number, r: number): Promise<string> {
  const rows = (await mcpExec(
    `SELECT op FROM yuplink.raid_building_place_op
      WHERE map_id = ${sqlStr(mapId)} AND q = ${q} AND r = ${r} AND gone_at IS NULL
      ORDER BY created_at DESC LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ op: string }> | null;
  return rows?.[0]?.op ? `:${rows[0].op}` : "";
}
