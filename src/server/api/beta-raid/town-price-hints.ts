// Подсказки цены ×1 для товаров ратуши (владелец, 04.10.2026: «цены и расход уже
// заданы по умолчанию — подумай, как что могло бы быть»). Не выдумываем:
//   • товар уже есть в городах — цена ×1 из последнего настроенного города
//     (31.10.2026: новый город подтягивает цены сам, а не «десятку» лавок);
//   • нет — медиана того, почём его продают лавки карты за золото (за штуку),
//     а товарам, которых и в лавках нет, — медиана их категории или вида.
import { createServerFn } from "@tanstack/react-start";
import { mcpExec } from "../../db/mcpClient";
import { requireAdmin } from "../../auth";
import { requireDesigner } from "@/server/api/beta-raid/island/island-editor-auth";

export type TownPriceHints = {
  /** `${kind}:${refId}` → цена ×1 последнего города, иначе медиана лавок за штуку в золоте. */
  byRef: Record<string, number>;
  /** id категории своего товара или `kind:<вид>` → медиана по ней. */
  byCat: Record<string, number>;
};

export const getTownPriceHints = createServerFn({ method: "GET" }).handler(
  async (): Promise<TownPriceHints> => {
    await requireDesigner();
    // Только продажа игроку за одно золото: цена «за золото + товар» (алхимия)
    // и скупка — другие деньги, в ×1 города они не годятся.
    const rows = (await mcpExec(
      `WITH p AS (
         SELECT m.kind, m.ref_id, m.price_amount / m.give_amount AS unit, c.category_id
           FROM yuplink.raid_market_item m
           LEFT JOIN yuplink.raid_custom_item c ON m.kind = 'custom' AND c.id = m.ref_id
          WHERE m.side = 'buy' AND m.price_resource = 'gold' AND m.price2_resource IS NULL
            AND m.give_amount > 0 AND m.price_amount > 0)
       SELECT 'ref' AS lvl, kind || ':' || COALESCE(ref_id, '') AS k,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY unit) AS med
         FROM p GROUP BY kind, ref_id
       UNION ALL
       SELECT 'cat', COALESCE(category_id, 'none'),
              percentile_cont(0.5) WITHIN GROUP (ORDER BY unit)
         FROM p WHERE kind = 'custom' GROUP BY category_id
       UNION ALL
       SELECT 'cat', 'kind:' || kind, percentile_cont(0.5) WITHIN GROUP (ORDER BY unit)
         FROM p GROUP BY kind
       UNION ALL
       SELECT 'town', k, price FROM (
         SELECT DISTINCT ON (k) k, price FROM (
           SELECT (x->>'kind') || ':' || COALESCE(x->>'refId', '') AS k,
                  (x->>'marketPrice')::numeric AS price, t.updated_at, t.created_at
             FROM yuplink.raid_town t,
                  jsonb_array_elements(COALESCE(t.config->'goods', '[]'::jsonb)) x
            WHERE jsonb_typeof(x->'marketPrice') = 'number') g
          WHERE price > 0
          ORDER BY k, updated_at DESC, created_at DESC) last;`,
      { wrapJson: true },
    )) as Array<{ lvl: string; k: string; med: number | string }>;
    return townPriceHints(rows ?? []);
  },
);

/** Строки запроса → подсказки; цена города главнее медианы лавок. */
export function townPriceHints(
  rows: ReadonlyArray<{ lvl: string; k: string; med: number | string }>,
): TownPriceHints {
  const out: TownPriceHints = { byRef: {}, byCat: {} };
  const town: Record<string, number> = {};
  for (const r of rows) {
    const v = Number(r.med);
    if (!(v > 0)) continue;
    (r.lvl === "town" ? town : r.lvl === "ref" ? out.byRef : out.byCat)[String(r.k)] = v;
  }
  Object.assign(out.byRef, town);
  return out;
}
