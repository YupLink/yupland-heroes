// Где лежат мои вещи: список складов игрока на активной карте.
//
// Игроки жаловались, что не помнят, куда что положили: складов на карте много,
// а окно показывает только тот, у которого стоишь. Здесь — координаты клетки и
// содержимое ЛИЧНЫХ ячеек (общая полка ничья, её в список не берём).
import { createServerFn } from "@tanstack/react-start";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { requireBetaRaid } from "./gate";
import { myMapId } from "./encounter-where";
import { accAccountId } from "../currency/move";

export type MyWarehouse = {
  q: number;
  r: number;
  items: Array<{ stackKey: string; name: string; image: string | null; count: number }>;
};

export const myWarehouses = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ list: MyWarehouse[] }> => {
    const wallet = await requireBetaRaid();
    const mapId = await myMapId(wallet);
    const account = await accAccountId(wallet);
    if (!account) return { list: [] };
    const rows = (await mcpExec(
      `SELECT q, r, stack_key AS "stackKey", name, image, count
         FROM yuplink.raid_warehouse_slot
        WHERE map_id = ${sqlStr(mapId)} AND scope = 'own'
          AND owner_account = ${sqlStr(account)} AND count > 0
        ORDER BY q, r, name;`,
      { wrapJson: true },
    ).catch(() => [])) as Array<{
      q: number;
      r: number;
      stackKey: string;
      name: string | null;
      image: string | null;
      count: number;
    }>;

    const byCell = new Map<string, MyWarehouse>();
    for (const row of rows ?? []) {
      const q = Number(row.q);
      const r = Number(row.r);
      const key = `${q},${r}`;
      const hit = byCell.get(key) ?? { q, r, items: [] };
      hit.items.push({
        stackKey: String(row.stackKey),
        name: String(row.name ?? ""),
        image: row.image ?? null,
        count: Number(row.count) || 0,
      });
      byCell.set(key, hit);
    }
    return { list: [...byCell.values()] };
  },
);
