// Карандаш цены декора (владелец, 22.10.2026: «по ценам декора — назначай так — но
// должен быть карандаш у админа и ангелины — чтобы настроить цену — цена в золоте и
// только»). Правит одну цену вида в settings.townhall_config.decor — точечно, одним
// UPDATE (jsonb_set): две правки разных видов не затирают друг друга. Право —
// редактор внутрянки замка (админы + дизайнер), как у каталога декора.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { requireCastleEditor } from "@/server/auth";
import { TOWN_HALL_CONFIG_KEY, TOWN_HALL_COST_MAX } from "@/lib/townHall";
import { KIND_RE } from "@/lib/townHallCatalog";
import { dropTownHallConfigCache } from "./townhall-config";

export const decorPriceInput = z.object({
  kind: z.string().regex(KIND_RE),
  gold: z.number().int().min(1).max(TOWN_HALL_COST_MAX),
});

export const decorPriceSql = (kind: string, gold: number): string => {
  const key = sqlStr(TOWN_HALL_CONFIG_KEY);
  const fresh = sqlStr(JSON.stringify({ decor: { [kind]: gold } }));
  return `INSERT INTO yuplink.settings (key, value) VALUES (${key}, ${fresh})
    ON CONFLICT (key) DO UPDATE SET value = jsonb_set(
      CASE WHEN jsonb_typeof(settings.value::jsonb -> 'decor') = 'object' THEN settings.value::jsonb
           ELSE settings.value::jsonb || '{"decor":{}}'::jsonb END,
      ARRAY['decor', ${sqlStr(kind)}], to_jsonb(${gold}::int))::text;`;
};

export const setTownHallDecorPrice = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => decorPriceInput.parse(d))
  .handler(async ({ data }) => {
    await requireCastleEditor();
    await mcpExec(decorPriceSql(data.kind, data.gold));
    dropTownHallConfigCache();
    return data;
  });
