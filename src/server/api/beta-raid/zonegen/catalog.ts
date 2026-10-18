// Каталоги ассетов для генератора: местности и декор по имени.
//
// Читают двое — генерация (сверить terrainId рецепта с каталогом) и ИИ
// (показать ему «id — имя», чтобы он выбирал из существующего, а не сочинял).
// Один запрос на вид ассета, без карты: каталог общий на все карты.
import { mcpExec } from "@/server/db/mcpClient";

export type CatalogItem = { id: string; name: string };

async function loadKind(kind: "terrain" | "decoration"): Promise<CatalogItem[]> {
  const rows = ((await mcpExec(
    `SELECT t.id, t.name FROM yuplink.mystic_item_template t
      WHERE t.kind = '${kind}' AND COALESCE(t.active, true)
      ORDER BY t.name, t.id;`,
    { wrapJson: true },
  )) ?? []) as Array<{ id: string; name: string | null }>;
  return rows.map((r) => ({ id: String(r.id), name: String(r.name ?? r.id) }));
}

/** Активные местности: то, чем можно красить. */
export const loadTerrainCatalog = (): Promise<CatalogItem[]> => loadKind("terrain");

/** Активный декор: имена для колорита в промпте ИИ. */
export const loadDecorCatalog = (): Promise<CatalogItem[]> => loadKind("decoration");

/** «id → имя» — такой словарь ждёт генератор и такой удобно читать в отчёте. */
export function namesById(items: CatalogItem[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const it of items) out[it.id] = it.name;
  return out;
}
