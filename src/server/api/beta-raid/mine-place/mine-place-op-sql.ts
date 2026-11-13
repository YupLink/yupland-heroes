// Ключи нажатий «Поставить шахту» (raid_mine_place_op, migrations/minev2-20):
// ключ ложится только вместе с шахтой; sent_at — дельта клетки записана в
// журнал карты (mine-place-announce). Неразосланные досылает минутный цикл
// (mine-place-resend) и повтор того же нажатия.
import { sqlStr } from "@/server/api/raid-shared";

/** Сколько ждать досылки: свежую постановку рассылает сама ручка. */
export const RESEND_AFTER_SEC = 30;
/** Сколько ключей досылать за проход; остальные — следующим. */
export const RESEND_BATCH = 100;

/** Ключ нажатия с клеткой как она есть: стоит ли там ещё эта шахта. */
export type PlaceOpRow = {
  op: string;
  map_id: string;
  q: number | string;
  r: number | string;
  kind: string;
  sent: boolean | null;
  building_id: string | null;
};

const OP_ROW = `SELECT o.op, o.map_id, o.q, o.r, o.kind, o.sent_at IS NOT NULL AS sent,
            c.building_id
       FROM yuplink.raid_mine_place_op o
       LEFT JOIN yuplink.raid_map_cells c
         ON c.map_id = o.map_id AND c.q = o.q AND c.r = o.r`;

/** Где встала шахта этого нажатия (ключ лёг только с ней) — свежим отдельным чтением. */
export const placeOpSql = (op: string): string =>
  `${OP_ROW}
      WHERE o.op = ${sqlStr(op)} LIMIT 1;`;

/** Неразосланные постановки старше RESEND_AFTER_SEC — старые первыми. */
export const placeUnsentSql = (): string =>
  `${OP_ROW}
      WHERE o.sent_at IS NULL AND o.at < now() - interval '${RESEND_AFTER_SEC} seconds'
      ORDER BY o.at
      LIMIT ${RESEND_BATCH};`;

/** Дельта записана — ключ разослан. */
export const placeSentSql = (op: string): string =>
  `UPDATE yuplink.raid_mine_place_op SET sent_at = now()
    WHERE op = ${sqlStr(op)} AND sent_at IS NULL;`;

/** Уборка ключей нажатий старше двух суток (повтор моста живёт секунды). */
export const placeOpSweepSql = (): string =>
  `DELETE FROM yuplink.raid_mine_place_op WHERE at < now() - interval '2 days';`;
