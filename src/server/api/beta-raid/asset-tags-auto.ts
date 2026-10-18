// Автоматическая разметка ассетов (владелец, 25.09: «должно размечаться
// автоматически»): метки проставляются сами, админ только поправляет.
//
//  · Местность ДЕКОРА — где он уже стоит на картах. Это тот же «опыт карты»,
//    по которому генератор зон и так ставил декор (zonegen/affinity.ts).
//  · РАСА декора, постройки и облика — по имени: «Магазин единорога»,
//    «Кабаньи ворота», «Юпик Лавка» (lib/raid/assetTags.racesFromName).
//  · Местность ПОСТРОЕК автоматически НЕ ставится: построек на картах мало
//    (тысяча клеток на пять карт), и метка «стоит только на траве 1» запретила
//    бы генератору ставить таверну на любой другой земле. Её отмечает админ.
//
// Строки, которые админ уже трогал (auto = false), автоматика не меняет.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { cleanList, racesFromName, type AssetTagKind } from "@/lib/raid/assetTags";
import { dropAssetTagsCaches, sqlTextArray } from "./asset-tags";

/** Новые ассеты появляются редко — догонять их чаще раза в 10 минут незачем. */
const STALE_MS = 10 * 60_000;
let lastRun = 0;

export type AutoTag = { refId: string; kind: AssetTagKind; terrains: string[]; races: string[] };

/** Декор: живые шаблоны + местности, на которых он стоит (любая карта). */
export const decorSql = `
  WITH terrains AS (
    SELECT id FROM yuplink.mystic_item_template WHERE kind = 'terrain'
  ), placed AS (
    SELECT c.decoration_id AS id, array_agg(DISTINCT c.terrain_id ORDER BY c.terrain_id) AS terrains
      FROM yuplink.raid_map_cells c
     WHERE c.decoration_id IS NOT NULL AND c.terrain_id IN (SELECT id FROM terrains)
     GROUP BY 1
  )
  SELECT d.id, d.name, COALESCE(p.terrains, '{}') AS terrains
    FROM yuplink.mystic_item_template d
    LEFT JOIN placed p ON p.id = d.id
   WHERE d.kind = 'decoration' AND COALESCE(d.active, true);`;

export const buildingsSql = `
  SELECT t.id, t.name FROM yuplink.mystic_item_template t
   WHERE t.kind = 'building' AND COALESCE(t.active, true);`;

export const skinsSql = `SELECT s.id, s.name FROM yuplink.raid_building_skin s;`;

type NamedRow = { id: string | number; name: string | null; terrains?: unknown };

/** Чистая сборка меток из строк базы — тест кормит свои. */
export function buildAutoTags(
  decor: NamedRow[],
  buildings: NamedRow[],
  skins: NamedRow[],
): AutoTag[] {
  const one = (kind: AssetTagKind, r: NamedRow, withTerrains: boolean): AutoTag => ({
    refId: String(r.id),
    kind,
    terrains: withTerrains ? cleanList(r.terrains) : [],
    races: racesFromName(r.name),
  });
  return [
    ...decor.map((r) => one("decoration", r, true)),
    ...buildings.map((r) => one("building", r, false)),
    ...skins.map((r) => one("skin", r, false)),
  ];
}

/** Один UPSERT на все метки: ручные строки (auto = false) остаются как есть. */
export function upsertSql(tags: AutoTag[]): string | null {
  if (tags.length === 0) return null;
  const values = tags
    .map(
      (t) =>
        `(${sqlStr(t.refId)}, ${sqlStr(t.kind)}, ${sqlTextArray(t.terrains)}, ${sqlTextArray(t.races)}, true, now())`,
    )
    .join(",\n");
  return `INSERT INTO yuplink.raid_asset_tags (ref_id, kind, terrains, races, auto, updated_at)
VALUES ${values}
ON CONFLICT (ref_id) DO UPDATE
  SET kind = EXCLUDED.kind, terrains = EXCLUDED.terrains, races = EXCLUDED.races, updated_at = now()
  WHERE yuplink.raid_asset_tags.auto
    AND (yuplink.raid_asset_tags.terrains IS DISTINCT FROM EXCLUDED.terrains
      OR yuplink.raid_asset_tags.races IS DISTINCT FROM EXCLUDED.races);`;
}

/** Разметить всё заново (только автоматические строки). Возвращает число меток. */
export async function autoTagAssets(): Promise<number> {
  lastRun = Date.now();
  const q = (sql: string) =>
    mcpExec(sql, { wrapJson: true }).then((r) => (r ?? []) as NamedRow[]);
  const [decor, buildings, skins] = await Promise.all([
    q(decorSql),
    q(buildingsSql),
    q(skinsSql).catch(() => [] as NamedRow[]),
  ]);
  const tags = buildAutoTags(decor, buildings, skins);
  const sql = upsertSql(tags);
  if (sql) await mcpExec(sql);
  await dropAssetTagsCaches();
  return tags.length;
}

/** То же, но не чаще раза в 10 минут: зовётся при открытии галочек. */
export async function autoTagAssetsIfStale(): Promise<void> {
  if (Date.now() - lastRun < STALE_MS) return;
  await autoTagAssets();
}
