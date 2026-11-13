// Чертёж купленной постройки (lib/buildingSale): снимок «шаблон + облик +
// настройка + таблицы клетки (витрина, заклинания) + цена» на момент покупки.
// id — от содержимого: одинаковые покупки ложатся одной стопкой, а правка
// шаблона или цены админом даёт новый чертёж и купленное не меняет. Цена нужна
// разбору: назад — половина того, что заплатили (DISMANTLE_REFUND_PCT).
import { createHash } from "node:crypto";
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { BUILDING_KIND, canonJson, type BuildingGood } from "@/lib/buildingSale";
import { allPrices, type PriceLine } from "@/lib/marketPrices";
import type { MarketItem } from "@/lib/marketItem";

type SaleItem = Pick<
  MarketItem,
  | "kind"
  | "refId"
  | "name"
  | "image"
  | "building"
  | "priceResource"
  | "priceToken"
  | "priceAmount"
  | "price2Resource"
  | "price2Token"
  | "price2Amount"
  | "priceMore"
>;

/** Цена одной постройки — все строки цены товара. */
const priceOf = (item: SaleItem): PriceLine[] => allPrices(item);

/** id чертежа по содержимому товара. */
export function blueprintIdOf(item: SaleItem): string {
  const good: BuildingGood = item.building ?? { skinId: null, config: null };
  const body = canonJson({
    b: item.refId,
    s: good.skinId,
    c: good.config,
    x: good.cells ?? null,
    p: priceOf(item),
  });
  return `bp_${createHash("sha256").update(body).digest("hex").slice(0, 24)}`;
}

/**
 * Товар глазами рюкзака: у постройки ref — чертёж (стопка building:<чертёж>),
 * у прочих — как есть. Одна дверь и для проверки места, и для выдачи.
 */
export function forBackpack<T extends SaleItem>(item: T): T {
  return item.kind === BUILDING_KIND ? { ...item, refId: blueprintIdOf(item) } : item;
}

/** Записать чертёж (повтор — ничего). Ошибку не глотаем: без чертежа нечего ставить. */
export async function ensureBlueprint(item: SaleItem): Promise<string> {
  if (!item.refId) throw new Error("market.bad_item");
  const id = blueprintIdOf(item);
  const good = item.building ?? { skinId: null, config: null };
  const json = (v: unknown) => (v ? `${sqlStr(JSON.stringify(v))}::jsonb` : "NULL");
  await mcpExec(
    `INSERT INTO yuplink.raid_building_blueprint
       (id, building_id, building_skin_id, building_config, name, image, cells, price)
     VALUES (${sqlStr(id)}, ${sqlStr(item.refId)}, ${good.skinId ? sqlStr(good.skinId) : "NULL"},
             ${json(good.config)}, ${sqlStr(item.name)}, ${item.image ? sqlStr(item.image) : "NULL"},
             ${json(good.cells)}, ${json(priceOf(item))})
     ON CONFLICT (id) DO NOTHING;`,
    { wrapJson: false },
  );
  return id;
}

export type Blueprint = {
  id: string;
  buildingId: string;
  skinId: string | null;
  config: Record<string, unknown> | null;
  name: string;
};

/** Чертёж по id; нет — null. */
export async function loadBlueprint(id: string): Promise<Blueprint | null> {
  const rows = (await mcpExec(
    `SELECT id, building_id, building_skin_id, building_config, name
       FROM yuplink.raid_building_blueprint WHERE id = ${sqlStr(id)} LIMIT 1;`,
    { wrapJson: true },
  )) as Array<Record<string, unknown>>;
  const r = rows?.[0];
  if (!r) return null;
  const cfg =
    typeof r.building_config === "string" ? JSON.parse(r.building_config) : r.building_config;
  return {
    id: String(r.id),
    buildingId: String(r.building_id),
    skinId: typeof r.building_skin_id === "string" ? r.building_skin_id : null,
    config: cfg && typeof cfg === "object" ? (cfg as Record<string, unknown>) : null,
    name: String(r.name ?? ""),
  };
}
