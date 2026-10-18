// Справочник построек и дорог для генератора поселений.
//
// Генератор НЕ рисует новых домов: в проекте нет ни одного генератора
// картинок, и «сгенерировать город» значит расставить те шаблоны, что админ
// уже завёл (82 активных на живой карте). Поэтому панели нужен честный список
// с двумя признаками, которых нет в общем каталоге (catalog.ts грузит только
// местность и декор): сколько у шаблона тиров (чтобы поставить достроенным) и
// нужен ли ему свой building_config.
//
// Эффект читаем ТОЛЬКО из meta.effect. Угадывать по имени здесь нельзя: у
// восьми шаблонов эффекта нет вовсе (Арена, Кузница, Лавка, Ломбард,
// Плавильня, Ратуша, Храм), и «Ратуша» без meta.effect — это декорация, а не
// ратуша; поставив её как town_hall, генератор завёл бы город (склад, цены)
// на пустом месте. Нет поля — возвращаем null и говорим об этом вслух.
import { mcpExec } from "@/server/db/mcpClient";
import type { BuildingOption } from "@/lib/raid/zonegen/settlement-types";
import type { AssetTags } from "@/lib/raid/assetTags";
import type { CatalogItem } from "./catalog";

/**
 * Постройки без своего building_config в игре «не настроены»: шахта не знает,
 * что добывает, поле — чем платит, портал — куда ведёт, дерево уровней — почём
 * ступени, табличка — что написано. Генератор такие ставит только по явному
 * выбору админа (см. ПРАВИЛА §8.14).
 */
const NEEDS_CONFIG = new Set(["mine", "field", "portal", "leveltree", "sign"]);

/** Справочник меняется правкой шаблонов, а не сам по себе: пять минут — с запасом. */
const TTL_MS = 5 * 60_000;
type Cache<T> = { expires: number; value: T } | null;
let buildingsCache: Cache<BuildingOption[]> = null;
let roadsCache: Cache<CatalogItem[]> = null;

/**
 * Текст запроса отдельно — правило «эффект только из meta» живёт в SQL, и тест
 * читает его. Тиры считаем через jsonb_typeof: шаблон с `tiers` не-массивом
 * (правили руками) должен дать ноль, а не уронить всю панель.
 */
export const buildingsSql = (): string =>
  `SELECT t.id, t.name, t.meta->>'effect' AS effect,
          CASE WHEN jsonb_typeof(t.meta->'tiers') = 'array'
               THEN jsonb_array_length(t.meta->'tiers') ELSE 0 END AS tiers
     FROM yuplink.mystic_item_template t
    WHERE t.kind = 'building' AND COALESCE(t.active, true)
    ORDER BY t.name, t.id;`;

export const roadsSql = (): string =>
  `SELECT t.id, t.name FROM yuplink.mystic_item_template t
    WHERE t.kind = 'road' AND COALESCE(t.active, true)
    ORDER BY t.name, t.id;`;

/**
 * Облики владельца (владелец, 25.09: «рандомно делай подборки»): группа
 * обликов привязана к шаблону через template_id, а имена обликов внутри группы
 * и есть ТЕМЫ — «Юпик», «Кабан», «Дракон». Город одной темы собирается из
 * обликов разных групп с общим словом в имени, поэтому к шаблону едут все
 * облики всех его групп. Группа без шаблона — просто папка картинок, её мимо.
 */
export const skinsSql = (): string =>
  `SELECT s.id, s.name, g.template_id
     FROM yuplink.raid_building_skin s
     JOIN yuplink.raid_building_group g ON g.id = s.group_id
    WHERE g.template_id IS NOT NULL
    ORDER BY g.template_id, s.name, s.id;`;

type Row = { id: string; name: string | null; effect: string | null; tiers: number | string };
export type SkinRow = { id: string | number; name: string | null; template_id: string | null };

type Skin = NonNullable<BuildingOption["skins"]>[number];
type Tags = ReadonlyMap<string, AssetTags>;

/** Облики по шаблону (с расами из меток). Облик без имени темы не даст — но поставить его можно. */
function skinsByTemplate(rows: SkinRow[], tags: Tags): Map<string, Skin[]> {
  const out = new Map<string, Skin[]>();
  for (const r of rows) {
    if (r.template_id === null || r.template_id === undefined) continue;
    const key = String(r.template_id);
    const list = out.get(key) ?? [];
    const races = tags.get(String(r.id))?.races ?? [];
    list.push({ id: String(r.id), name: String(r.name ?? ""), ...(races.length ? { races } : {}) });
    out.set(key, list);
  }
  return out;
}

/** Сборка из строк — без базы, чтобы тест мог скормить свои. */
export function toOptions(
  rows: Row[],
  skinRows: SkinRow[] = [],
  tags: Tags = new Map(),
): BuildingOption[] {
  const skins = skinsByTemplate(skinRows, tags);
  return rows.map((r) => {
    const effect = typeof r.effect === "string" && r.effect.trim() ? r.effect.trim() : null;
    // Метки шаблона: раса — только в город своей расы, местность — только на неё.
    const own = tags.get(String(r.id));
    return {
      ...(own?.races.length ? { races: own.races } : {}),
      ...(own?.terrains.length ? { terrains: own.terrains } : {}),
      id: String(r.id),
      name: String(r.name ?? r.id),
      effect,
      tiers: Math.max(0, Number(r.tiers) || 0),
      needsConfig: effect !== null && NEEDS_CONFIG.has(effect),
      skins: skins.get(String(r.id)) ?? [],
    };
  });
}

/**
 * Активные постройки: что генератор вообще имеет право поставить. Облики —
 * украшение, а не условие: таблиц групп могло не быть (свежая база), и тогда
 * город встаёт в базовых картинках шаблонов, как у listGroups в building-skins.
 */
export async function loadBuildingOptions(): Promise<BuildingOption[]> {
  if (buildingsCache && buildingsCache.expires > Date.now()) return buildingsCache.value;
  const { loadAssetTags } = await import("../asset-tags");
  const [rows, skinRows, tags] = await Promise.all([
    mcpExec(buildingsSql(), { wrapJson: true }),
    mcpExec(skinsSql(), { wrapJson: true }).catch(() => []),
    loadAssetTags(),
  ]);
  const value = toOptions((rows ?? []) as Row[], (skinRows ?? []) as SkinRow[], tags);
  buildingsCache = { expires: Date.now() + TTL_MS, value };
  return value;
}

/** Активные дороги: панель выбирает, чем связывать дворы поселения. */
export async function loadRoadOptions(): Promise<CatalogItem[]> {
  if (roadsCache && roadsCache.expires > Date.now()) return roadsCache.value;
  const rows = ((await mcpExec(roadsSql(), { wrapJson: true })) ?? []) as Array<{
    id: string;
    name: string | null;
  }>;
  const value = rows.map((r) => ({ id: String(r.id), name: String(r.name ?? r.id) }));
  roadsCache = { expires: Date.now() + TTL_MS, value };
  return value;
}

/** Админ завёл новую постройку и хочет видеть её сразу, а не через 5 минут. */
export function dropBuildingCatalogCache(): void {
  buildingsCache = null;
  roadsCache = null;
}
