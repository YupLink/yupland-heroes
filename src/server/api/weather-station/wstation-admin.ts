// Миры в метеостанции — правка админа на месте (владелец, 29.10.2026: «можно ли миры
// подписать, чтобы были с адекватными названиями»; тестовый мир «Генерация 128» — убрать).
//  · Переименовать — raid_maps.name: имя меняется везде в игре, не только в станции.
//  · Скрыть из станции — settings.wstation_hidden (список id): погода у мира идёт как
//    шла, игроки его в станции не видят и обряд туда не провести; админ видит и вернёт.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/server/auth";
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";

const mapId = z.string().regex(/^rmap_[A-Za-z0-9_-]{1,60}$/);

export const adminRenameWorld = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({ mapId, name: z.string().trim().min(1).max(60) })
      .strict()
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ name: string }> => {
    requireAdmin();
    const rows = (await mcpExec(
      `UPDATE yuplink.raid_maps SET name = ${sqlStr(data.name)}, updated_at = now()
        WHERE id = ${sqlStr(data.mapId)} RETURNING name`,
      { wrapJsonCte: true },
    )) as Array<{ name: string }> | null;
    const name = rows?.[0]?.name;
    if (name !== data.name) throw new Error("Мир не найден");
    return { name };
  });

export const adminSetWorldHidden = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ mapId, hidden: z.boolean() }).strict().parse(d))
  .handler(async ({ data }): Promise<{ hidden: boolean }> => {
    requireAdmin();
    const id = sqlStr(data.mapId);
    // Список без повторов; снять — убрать id, скрыть — добавить.
    const next = data.hidden
      ? `(SELECT jsonb_agg(DISTINCT x) FROM jsonb_array_elements_text(cur.v || jsonb_build_array(${id})) x)`
      : `COALESCE((SELECT jsonb_agg(x) FROM jsonb_array_elements_text(cur.v) x WHERE x <> ${id}), '[]'::jsonb)`;
    const rows = (await mcpExec(
      `WITH cur AS (
         SELECT COALESCE((SELECT s.value::jsonb FROM yuplink.settings s WHERE s.key = 'wstation_hidden'),
                         '[]'::jsonb) AS v
       )
       INSERT INTO yuplink.settings (key, value)
       SELECT 'wstation_hidden', (${next})::text FROM cur
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
       RETURNING value`,
      { wrapJsonCte: true },
    )) as Array<{ value: string }> | null;
    const list = JSON.parse(rows?.[0]?.value ?? "[]") as string[];
    return { hidden: list.includes(data.mapId) };
  });
