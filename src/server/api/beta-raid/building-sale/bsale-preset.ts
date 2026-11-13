// Шаблоны построек для продажи (владелец 05.11.2026: «в админке каша … систему
// с шаблонами нужно использовать сразу же»). Админ настраивает постройку на
// карте обычным режимом бога — облик, поведение, грядку, витрину плавильни,
// заклинания — и сохраняет клетку в шаблон. В лавке построек товар — выбор
// шаблона и цена, без второй копии всех редакторов.
//
// Шаблон — снимок клетки-источника; сохранил ту же клетку ещё раз — шаблон
// обновился (один на клетку), и товары на нём продают уже новое.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nanoid } from "nanoid";
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { requireGodAdmin } from "@/server/api/beta-raid/island/island-editor-auth";
import { cellBuildingEffect } from "@/lib/buildingEffect";
import { SALE_BANNED_EFFECTS, type CellRows, type JsonObject } from "@/lib/buildingSale";
import { captureCellsSql } from "./bsale-cells-sql";

export type BuildingPreset = {
  id: string;
  name: string;
  image: string | null;
  buildingId: string;
  skinId: string | null;
  config: JsonObject | null;
  cells: CellRows | null;
  /** Поведение постройки шаблона (для подписи в списке). */
  effect: string | null;
};

const parse = (v: unknown): unknown => (typeof v === "string" ? JSON.parse(v) : v);
const isObj = (v: unknown): v is JsonObject => !!v && typeof v === "object" && !Array.isArray(v);

/** Отказ, если постройку игрокам не продать (lib/buildingSale). */
export function bannedText(effect: string | null): string | null {
  if (!effect || !SALE_BANNED_EFFECTS.includes(effect)) return null;
  return effect === "mine"
    ? "Шахты продаются заготовками у Архитектора, не здесь"
    : "Ратуши, порталы и лавки построек игрокам не продаются";
}

const SELECT = `SELECT p.id, p.name, p.image, p.building_id, p.building_skin_id,
                       p.building_config, p.cells, t.meta, t.name AS tpl_name
                  FROM yuplink.raid_building_preset p
                  LEFT JOIN yuplink.mystic_item_template t ON t.id = p.building_id`;

function presetOf(r: Record<string, unknown>): BuildingPreset {
  const config = parse(r.building_config);
  const cells = parse(r.cells);
  return {
    id: String(r.id),
    name: String(r.name ?? ""),
    image: typeof r.image === "string" ? r.image : null,
    buildingId: String(r.building_id),
    skinId: typeof r.building_skin_id === "string" ? r.building_skin_id : null,
    config: isObj(config) ? config : null,
    cells: isObj(cells) ? (cells as CellRows) : null,
    effect: cellBuildingEffect(config, parse(r.meta), String(r.tpl_name ?? "")),
  };
}

/** Шаблон по id; нет (удалён или шаблон постройки сняли) — null. */
export async function loadPreset(id: string): Promise<BuildingPreset | null> {
  const rows = (await mcpExec(`${SELECT} WHERE p.id = ${sqlStr(id)} AND t.id IS NOT NULL;`, {
    wrapJson: true,
  })) as Array<Record<string, unknown>>;
  return rows?.[0] ? presetOf(rows[0]) : null;
}

async function requireMoneyAdmin(): Promise<string> {
  const god = await requireGodAdmin();
  if (!god.money) throw new Error("Шаблоны построек для продажи заводит только админ");
  return god.mapId;
}

/** Сохранить постройку клетки в шаблон (та же клетка — обновить). */
export const saveBuildingPreset = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({ q: z.number().int(), r: z.number().int(), name: z.string().trim().max(80) })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ id: string; name: string }> => {
    const mapId = await requireMoneyAdmin();
    const m = sqlStr(mapId);
    const rows = (await mcpExec(
      `SELECT c.building_id, c.building_config, t.meta, t.name, sk.name AS skin_name
         FROM yuplink.raid_map_cells c
         JOIN yuplink.mystic_item_template t ON t.id = c.building_id AND t.kind = 'building'
         LEFT JOIN yuplink.raid_building_skin sk ON sk.id = c.building_skin_id
        WHERE c.map_id = ${m} AND c.q = ${data.q} AND c.r = ${data.r} LIMIT 1;`,
      { wrapJson: true },
    )) as Array<Record<string, unknown>>;
    const cell = rows?.[0];
    if (!cell) throw new Error("На клетке нет постройки");
    const effect = cellBuildingEffect(
      parse(cell.building_config),
      parse(cell.meta),
      String(cell.name),
    );
    const banned = bannedText(effect);
    if (banned) throw new Error(banned);
    if (effect === "market") {
      // Витрина — с товарами; выдача токенов в копии не едет: каждая поставленная
      // лавка — свой запас, и скупка за токены / продажа токенов множили бы выплаты.
      const goods = (await mcpExec(
        `SELECT count(*)::int AS n,
                count(*) FILTER (WHERE (side = 'sell' AND (price_resource = 'token'
                                   OR price2_resource = 'token'
                                   OR price_more @> '[{"resource": "token"}]'::jsonb))
                                OR (side = 'buy' AND kind = 'resource' AND ref_id = 'token'))::int AS tok
           FROM yuplink.raid_market_item
          WHERE map_id = ${m} AND q = ${data.q} AND r = ${data.r};`,
        { wrapJson: true },
      )) as Array<{ n: number; tok: number }>;
      if (!(Number(goods?.[0]?.n) > 0)) throw new Error("Витрина лавки пуста — сначала товары");
      if (Number(goods?.[0]?.tok) > 0) {
        throw new Error("Выдача токенов (скупка за токены, продажа токенов) в шаблон не идёт");
      }
    }
    const name = data.name || String(cell.skin_name || cell.name);
    const cells = captureCellsSql(effect, mapId, data.q, data.r);
    // Картинка — облика, иначе первого тира шаблона: так постройку рисует карта.
    const saved = (await mcpExec(
      `INSERT INTO yuplink.raid_building_preset
         (id, name, src_map, src_q, src_r, building_id, building_skin_id, building_config, cells, image)
       SELECT ${sqlStr(`bpre_${nanoid(12)}`)}, ${sqlStr(name)}, ${m}, ${data.q}, ${data.r},
              c.building_id, c.building_skin_id, c.building_config, ${cells},
              COALESCE(sk.image, t.meta->'tiers'->0->>'imageUrl', t.image_url)
         FROM yuplink.raid_map_cells c
         JOIN yuplink.mystic_item_template t ON t.id = c.building_id
         LEFT JOIN yuplink.raid_building_skin sk ON sk.id = c.building_skin_id
        WHERE c.map_id = ${m} AND c.q = ${data.q} AND c.r = ${data.r}
       ON CONFLICT (src_map, src_q, src_r) DO UPDATE SET
              name = EXCLUDED.name, building_id = EXCLUDED.building_id,
              building_skin_id = EXCLUDED.building_skin_id,
              building_config = EXCLUDED.building_config, cells = EXCLUDED.cells,
              image = EXCLUDED.image, updated_at = now()
       RETURNING id, name;`,
      { wrapJsonCte: true },
    )) as Array<{ id: string; name: string }>;
    const row = saved?.[0];
    if (!row) throw new Error("На клетке нет постройки");
    return { id: String(row.id), name: String(row.name) };
  });

/** Все шаблоны построек — для выбора в лавке построек. */
export const listBuildingPresets = createServerFn({ method: "GET" }).handler(
  async (): Promise<BuildingPreset[]> => {
    await requireMoneyAdmin();
    const rows = (await mcpExec(`${SELECT} ORDER BY p.updated_at DESC;`, {
      wrapJson: true,
    })) as Array<Record<string, unknown>>;
    return (rows ?? []).map(presetOf);
  },
);

/** Удалить шаблон. Товары на нём перестают продаваться (покупка — отказ). */
export const deleteBuildingPreset = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().min(1).max(64) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    await requireMoneyAdmin();
    await mcpExec(`DELETE FROM yuplink.raid_building_preset WHERE id = ${sqlStr(data.id)};`);
    return { ok: true };
  });
