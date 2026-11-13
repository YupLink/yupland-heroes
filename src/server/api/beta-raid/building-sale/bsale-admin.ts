// Товар «Постройка» в лавке построек (lib/buildingSale): проверка позиции при
// сохранении и перед покупкой. Цену, запас и лимит задаёт админ в той же форме,
// что у любого товара; что именно продаётся — шаблон постройки (bsale-preset),
// настроенный на карте. У товаров первого шага облик и настройка — в самом товаре.
//
//  · только витрина покупки и только лавка с поведением «Продажа построек»;
//  · шаблон — живая постройка (kind='building'), не шахта (у шахт — Архитектор);
//  · облик — из обликов постройки (raid_building_skin) или без облика;
//  · имя и картинка по умолчанию — облика, иначе шаблона.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import {
  BUILDING_KIND,
  BUILDING_SHOP_EFFECT,
  SALE_BANNED_EFFECTS,
  type BuildingGood,
  type JsonObject,
} from "@/lib/buildingSale";
import { cellBuildingEffect } from "@/lib/buildingEffect";

/** Позиция формы — ровно то, что читает проверка. */
type BuildingGoodInput = {
  kind: string;
  side: string;
  q: number;
  r: number;
  refId: string | null;
  name: string;
  image: string | null;
  /** Из формы: настройка — любой объект JSON (разбирает zod). */
  building: {
    skinId: string | null;
    config: Record<string, unknown> | null;
    presetId?: string | null;
  } | null;
};

type Tpl = { name: string; meta: unknown; image: string | null };

async function templateOf(id: string): Promise<Tpl | null> {
  const rows = (await mcpExec(
    `SELECT name, meta, image_url FROM yuplink.mystic_item_template
      WHERE id = ${sqlStr(id)} AND kind = 'building' LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ name: string; meta: unknown; image_url: string | null }>;
  const t = rows?.[0];
  if (!t) return null;
  const meta = typeof t.meta === "string" ? JSON.parse(t.meta) : t.meta;
  // Картинка шаблона — первый тир (по нему постройку и рисует карта).
  const tier = (meta as { tiers?: Array<{ imageUrl?: unknown }> } | null)?.tiers?.[0]?.imageUrl;
  return { name: t.name, meta, image: typeof tier === "string" && tier ? tier : t.image_url };
}

/** Облик ЭТОЙ постройки: из группы обликов её шаблона. */
async function skinOf(
  id: string,
  templateId: string,
): Promise<{ name: string; image: string } | null> {
  const rows = (await mcpExec(
    `SELECT s.name, s.image FROM yuplink.raid_building_skin s
       JOIN yuplink.raid_building_group g ON g.id = s.group_id
      WHERE s.id = ${sqlStr(id)} AND g.template_id = ${sqlStr(templateId)} LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ name: string; image: string }>;
  return rows?.[0] ?? null;
}

/** Поведение постройки на клетке лавки: своё у клетки, иначе шаблона. */
export async function shopEffectAt(mapId: string, q: number, r: number): Promise<string | null> {
  const rows = (await mcpExec(
    `SELECT c.building_config, t.meta, t.name FROM yuplink.raid_map_cells c
       LEFT JOIN yuplink.mystic_item_template t ON t.id = c.building_id
      WHERE c.map_id = ${sqlStr(mapId)} AND c.q = ${q} AND c.r = ${r} LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ building_config: unknown; meta: unknown; name: string | null }>;
  const c = rows?.[0];
  if (!c) return null;
  return cellBuildingEffect(c.building_config, c.meta, c.name);
}

/** Поведение постройки-товара: своё в настройке, иначе шаблона. */
const goodEffect = (good: BuildingGoodInput["building"] | BuildingGood, tpl: Tpl): string | null =>
  cellBuildingEffect(good?.config ?? null, tpl.meta, tpl.name);

/**
 * Позиция-постройка: отказ админу до записи, если её нельзя исполнить; иначе
 * имя и картинка по умолчанию. Прочие виды товара не трогает.
 */
export async function applyBuildingGood(data: BuildingGoodInput, mapId: string): Promise<void> {
  const shop = await shopEffectAt(mapId, data.q, data.r);
  if (data.kind !== BUILDING_KIND) {
    // Лавка построек торгует только постройками — иначе её витрина стала бы обычным рынком.
    if (shop === BUILDING_SHOP_EFFECT)
      throw new Error("В лавке построек продаются только постройки");
    return;
  }
  if (shop !== BUILDING_SHOP_EFFECT) {
    throw new Error("Постройку продаёт только постройка с поведением «Продажа построек»");
  }
  if (data.side !== "buy") throw new Error("Постройка ставится только в витрину покупки");
  const presetId = data.building?.presetId ?? null;
  if (presetId) {
    const { loadPreset, bannedText } = await import("./bsale-preset");
    const p = await loadPreset(presetId);
    if (!p) throw new Error("Шаблона постройки больше нет — выбери другой");
    const banned = bannedText(p.effect);
    if (banned) throw new Error(banned);
    data.refId = p.buildingId;
    data.building = { skinId: null, config: null, presetId: p.id };
    data.name = data.name.trim() || p.name;
    data.image = data.image || p.image;
    return;
  }
  if (!data.refId) throw new Error("Выбери шаблон постройки");
  const tpl = await templateOf(data.refId);
  if (!tpl) throw new Error("Такой постройки нет в справочнике");
  const effect = goodEffect(data.building, tpl);
  if (effect && SALE_BANNED_EFFECTS.includes(effect)) {
    throw new Error(
      effect === "mine"
        ? "Шахты продаются заготовками у Архитектора, не здесь"
        : "Ратуши, порталы и лавки построек игрокам не продаются",
    );
  }
  const skinId = data.building?.skinId ?? null;
  const skin = skinId ? await skinOf(skinId, data.refId) : null;
  if (skinId && !skin) throw new Error("Такого облика у этой постройки нет");
  data.building = { skinId, config: (data.building?.config as JsonObject | null) ?? null };
  data.name = data.name.trim() || skin?.name || tpl.name;
  data.image = data.image || skin?.image || tpl.image;
}

/**
 * Покупка постройки — до денег: шаблон жив и не стал запрещённым (правку могли
 * внести позже). Ответ — что продаётся сейчас: у товара на шаблоне постройки —
 * его облик, настройка и таблицы клетки (их и снимет чертёж).
 */
export async function assertBuildingForSale(
  refId: string | null,
  good: BuildingGood | null | undefined,
): Promise<{ refId: string; building: BuildingGood }> {
  if (good?.presetId) {
    const { loadPreset } = await import("./bsale-preset");
    const p = await loadPreset(good.presetId);
    if (!p || (p.effect && SALE_BANNED_EFFECTS.includes(p.effect))) {
      throw new Error("market.bad_item");
    }
    const building: BuildingGood = { skinId: p.skinId, config: p.config, presetId: p.id };
    if (p.cells) building.cells = p.cells;
    return { refId: p.buildingId, building };
  }
  const tpl = refId ? await templateOf(refId) : null;
  if (!tpl || !refId) throw new Error("market.bad_item");
  const effect = goodEffect(good ?? null, tpl);
  if (effect && SALE_BANNED_EFFECTS.includes(effect)) throw new Error("market.bad_item");
  return { refId, building: good ?? { skinId: null, config: null } };
}
