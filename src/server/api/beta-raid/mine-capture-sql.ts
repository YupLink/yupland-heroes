// Захват шахты одним вызовом под локом шахты (`mine:` + клетка — тот же, что
// у «Забрать» DARAI-шахты, постановки и охраны): raid_mine_capture зовётся,
// только пока на клетке стоит та же постройка. Между проверками ручки и
// захватом шахту могли забрать в рюкзак — тогда строки нет, ручка отказывает
// и возвращает энергию, а владение пустой клеткой не появляется.
//
// Замок шахтёра (§8.123) сверяется здесь же, под тем же локом, что и его
// постановка: замок встал между проверкой ручки и захватом — захвата нет
// (locked: true, ручка вернёт энергию), raid_mine_capture не зовётся вовсе.
import { sqlStr } from "@/server/api/raid-shared";
import { wardActiveSql } from "@/server/api/beta-raid/mine-ward/mine-ward-sql";
import { locksSql } from "@/server/api/beta-raid/chest/chest-net-sql";
import { mineLockKey } from "@/server/api/beta-raid/mine-place/mine-place-sql";

export type CaptureAt = {
  mapId: string;
  q: number;
  r: number;
  account: string;
  wallet: string;
  /** Постройка клетки, которую видела ручка (loadCellBuilding). */
  buildingId: string;
};

export function captureMineSql(o: CaptureAt): string {
  const q = Math.floor(o.q);
  const r = Math.floor(o.r);
  const map = sqlStr(o.mapId);
  return `${locksSql(mineLockKey(o.mapId, q, r))}
     SELECT row_to_json(_t.*) AS _row FROM (
       SELECT NOT w.locked AS captured, w.locked,
              CASE WHEN NOT w.locked THEN
                yuplink.raid_mine_capture(${map}, ${q}, ${r}, ${sqlStr(o.account)}, ${sqlStr(o.wallet)})
              END AS old
         FROM (SELECT ${wardActiveSql({ mapId: o.mapId, q, r })} AS locked
                 FROM yuplink.raid_map_cells c
                WHERE c.map_id = ${map} AND c.q = ${q} AND c.r = ${r}
                  AND c.building_id = ${sqlStr(o.buildingId)}
               OFFSET 0) w
     ) _t;`;
}
