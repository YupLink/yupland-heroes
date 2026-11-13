// Данные скрина клада (treasure-shot): клетки вокруг кадра с картинками местности,
// декора и построек — те же поля, что берёт карта (map-assets: image_url шаблона,
// у постройки — облик или картинка тира).
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";

export type ShotCell = {
  q: number;
  r: number;
  terrain: string | null;
  decor: string | null;
  building: string | null;
};

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/** Клетки в гекс-радиусе rad вокруг (q, r). */
export function shotCellsSql(mapId: string, q: number, r: number, rad: number): string {
  return `SELECT c.q, c.r,
                 CASE WHEN c.terrain_id IS NOT NULL THEN tt.image_url END AS terrain,
                 CASE WHEN c.decoration_id IS NOT NULL THEN dt.image_url END AS decor,
                 CASE WHEN c.building_id IS NOT NULL
                      THEN COALESCE(sk.image, bt.meta->'tiers'->(COALESCE(st.tier, 0))->>'imageUrl',
                                    bt.meta->'tiers'->0->>'imageUrl', bt.image_url) END AS building
            FROM yuplink.raid_map_cells c
            LEFT JOIN yuplink.mystic_item_template tt ON tt.id = c.terrain_id
            LEFT JOIN yuplink.mystic_item_template dt ON dt.id = c.decoration_id
            LEFT JOIN yuplink.mystic_item_template bt ON bt.id = c.building_id
            LEFT JOIN yuplink.raid_building_skin sk ON sk.id = c.building_skin_id
            LEFT JOIN yuplink.beta_raid_building_state st
              ON st.map_id = c.map_id AND st.q = c.q AND st.r = c.r
           WHERE c.map_id = ${sqlStr(mapId)}
             AND c.q BETWEEN ${q - rad} AND ${q + rad} AND c.r BETWEEN ${r - rad} AND ${r + rad}
             AND abs((c.q + c.r) - ${q + r}) <= ${rad};`;
}

export async function loadShotCells(
  mapId: string,
  q: number,
  r: number,
  rad: number,
): Promise<ShotCell[]> {
  const rows = ((await mcpExec(shotCellsSql(mapId, q, r, rad), { wrapJson: true })) ?? []) as Array<
    Record<string, unknown>
  >;
  return rows.map((x) => ({
    q: Number(x.q),
    r: Number(x.r),
    terrain: str(x.terrain),
    decor: str(x.decor),
    building: str(x.building),
  }));
}
