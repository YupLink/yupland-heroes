// Поле дуэли — из той местности, где стоит герой (владелец 08.11.2026: «фон
// должен идти из той местности, где идёт сражение»). Земля — местность клетки
// героя (на воде — ближайшая суша), препятствия — декор соседних клеток: в
// пустыне пальмы и кусты, в горах камни.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { WATER_SQL } from "@/server/api/beta-raid/cell-sql";

export type DuelField = {
  /** Текстура местности (бесшовная, как у клетки карты); нет — нейтральная земля. */
  terrain: string | null;
  /** Картинки препятствий: декор вокруг героя, ближний — первым. */
  decor: string[];
};

/** Сколько клеток вокруг героя смотреть и сколько разных препятствий брать. */
const AROUND = 8;
const DECOR_KINDS = 6;

/** Камень и ели с карты — когда вокруг героя декора нет (героя нет на карте). */
const ROCK_IDS = ["decoration_nVZxWlASdo", "decoration_1MeQfVCgK-", "decoration_eDIWZYjiaL"];

type Row = { k: "terrain" | "decor"; img: string | null };

export async function duelField(account: string): Promise<DuelField> {
  const rows = ((await mcpExec(
    `WITH p AS (
       SELECT map_id, q, r FROM yuplink.beta_raid_positions
        WHERE account_id = ${sqlStr(account)} AND map_id IS NOT NULL LIMIT 1
     ), land AS (
       SELECT c.decoration_id, t.image_url AS t_img,
              (abs(c.q - p.q) + abs(c.r - p.r) + abs(c.q + c.r - p.q - p.r)) / 2 AS d
         FROM p
         JOIN yuplink.raid_map_cells c
           ON c.map_id = p.map_id
          AND c.q BETWEEN p.q - ${AROUND} AND p.q + ${AROUND}
          AND c.r BETWEEN p.r - ${AROUND} AND p.r + ${AROUND}
         JOIN yuplink.mystic_item_template t ON t.id = c.terrain_id
        WHERE NOT ${WATER_SQL} AND t.image_url IS NOT NULL
     )
     SELECT 'terrain' AS k, (SELECT t_img FROM land ORDER BY d LIMIT 1) AS img
     UNION ALL
     SELECT 'decor', img FROM (
       SELECT img FROM (
         SELECT DISTINCT ON (dk.id) dk.image_url AS img, l.d
           FROM land l JOIN yuplink.mystic_item_template dk ON dk.id = l.decoration_id
          WHERE l.d <= ${AROUND} AND dk.image_url IS NOT NULL
            AND COALESCE(dk.meta->>'walkable', '') <> 'true'
            AND jsonb_typeof(dk.meta->'bridge') IS DISTINCT FROM 'object'
          ORDER BY dk.id, l.d
       ) x ORDER BY d LIMIT ${DECOR_KINDS}
     ) y;`,
    { wrapJson: true },
  )) ?? []) as Row[];
  const terrain = rows.find((r) => r.k === "terrain")?.img ?? null;
  const decor = rows.filter((r) => r.k === "decor" && r.img).map((r) => r.img as string);
  if (decor.length > 0) return { terrain, decor };
  const rocks = ((await mcpExec(
    `SELECT image_url AS img FROM yuplink.mystic_item_template
      WHERE id IN (${ROCK_IDS.map(sqlStr).join(", ")}) AND image_url IS NOT NULL;`,
    { wrapJson: true },
  )) ?? []) as Array<{ img: string }>;
  return { terrain, decor: rocks.map((r) => r.img) };
}
