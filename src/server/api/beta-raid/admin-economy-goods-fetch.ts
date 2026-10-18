// Чтения БД для товарной таблицы «Экономики». Вынесено из admin-economy-goods,
// чтобы соблюсти правило ≤250 строк: сама сборка (join, дедуп, сортировка) —
// сложнее, читаемее в одном месте; SQL-фетчи — здесь.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";

export type MarketRow = {
  id: string;
  q: number;
  r: number;
  side: "buy" | "sell";
  kind: string;
  ref_id: string | null;
  name: string;
  image: string | null;
  price_resource: string;
  price_token: string | null;
  price_amount: number;
  stock: number | null;
  sold: number;
  give_token: string | null;
};

export type TownRawRow = { q: number; r: number; config: unknown };
export type TownStockRow = { q: number; r: number; good_id: string; amount: number };
export type StackRow = {
  stack_key: string;
  kind: string;
  ref_id: string | null;
  name: string;
  image: string | null;
  total: number;
};
export type FieldRow = { q: number; r: number; building_config: unknown; name: string | null };

export async function fetchMarkets(mapId: string): Promise<MarketRow[]> {
  const rows = (await mcpExec(
    `SELECT id, q, r, side, kind, ref_id, name, image,
            price_resource, price_token, price_amount, stock, sold, give_token
       FROM yuplink.raid_market_item WHERE map_id=${sqlStr(mapId)};`,
    { wrapJson: true },
  ).catch(() => [])) as MarketRow[];
  return rows ?? [];
}

export async function fetchTowns(mapId: string): Promise<TownRawRow[]> {
  const rows = (await mcpExec(
    `SELECT q, r, config FROM yuplink.raid_town WHERE map_id=${sqlStr(mapId)};`,
    { wrapJson: true },
  ).catch(() => [])) as TownRawRow[];
  return rows ?? [];
}

export async function fetchTownStock(mapId: string): Promise<TownStockRow[]> {
  const rows = (await mcpExec(
    `SELECT q, r, good_id, amount FROM yuplink.raid_town_stock
      WHERE map_id=${sqlStr(mapId)};`,
    { wrapJson: true },
  ).catch(() => [])) as TownStockRow[];
  return rows ?? [];
}

export async function fetchWarehouse(mapId: string): Promise<StackRow[]> {
  const rows = (await mcpExec(
    `SELECT stack_key, min(kind) AS kind, min(ref_id) AS ref_id,
            min(name) AS name, min(image) AS image, sum(count)::numeric AS total
       FROM yuplink.raid_warehouse_slot WHERE map_id=${sqlStr(mapId)} AND count > 0
      GROUP BY stack_key;`,
    { wrapJson: true },
  ).catch(() => [])) as StackRow[];
  return rows ?? [];
}

export async function fetchBackpacks(): Promise<StackRow[]> {
  const rows = (await mcpExec(
    `SELECT stack_key, min(kind) AS kind, min(ref_id) AS ref_id,
            min(name) AS name, min(image) AS image, sum(count)::numeric AS total
       FROM yuplink.raid_hero_backpack WHERE count > 0 GROUP BY stack_key;`,
    { wrapJson: true },
  ).catch(() => [])) as StackRow[];
  return rows ?? [];
}

export async function fetchFields(mapId: string): Promise<FieldRow[]> {
  // Клетка-поле — building_config->field. Активность = «стоит хоть один
  // работник» — иначе поле молчит и в сутки не даёт ничего.
  const rows = (await mcpExec(
    `SELECT c.q, c.r, c.building_config, t.name
       FROM yuplink.raid_map_cells c
       LEFT JOIN yuplink.mystic_item_template t ON t.id = c.building_id
      WHERE c.map_id=${sqlStr(mapId)}
        AND c.building_config->'field' IS NOT NULL
        AND EXISTS (SELECT 1 FROM yuplink.raid_field_worker w
                     WHERE w.map_id=c.map_id AND w.q=c.q AND w.r=c.r
                       AND w.hero_id IS NOT NULL);`,
    { wrapJson: true },
  ).catch(() => [])) as FieldRow[];
  return rows ?? [];
}
