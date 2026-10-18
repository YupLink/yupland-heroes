// Постройки на карте: объект, который меняет облик за ресурс.
//
// Один шаблон описывает цепочку тиров: у каждого своя картинка, цена перехода
// на следующий и требования к герою. Игрок подходит вплотную, платит — и на
// клетке встаёт следующий тир.
//
// Тиры лежат в meta шаблона (mystic_item_template.kind = 'building'), текущий
// тир клетки — в beta_raid_building_state.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import type { MarketPriceResource } from "@/lib/marketItem";
import type { ResourcePrice } from "./resource-pay";

export type BuildPrice = {
  kind: "tickets" | "likes" | "token";
  /** Символ токена, если платят токеном. */
  token?: string | null;
  amount: number;
};

/**
 * Полная цена перехода: НЕСКОЛЬКО ресурсов разом, как у алхимии в маркете.
 * «300 дерева и 50 камня» — одна цена, а не выбор из двух.
 *
 * Старое поле price (один ресурс из трёх) осталось: постройки заведены с ним,
 * и переучивать их незачем — оно читается как список из одной строки.
 */
export type BuildCost = ResourcePrice[];

export type BuildRequire = {
  /** null — подойдёт любая раса. */
  race?: string | null;
  /** null — подойдёт любая специализация. */
  spec?: string | null;
};

export type BuildingTier = {
  name: string;
  imageUrl: string | null;
  /** Чем платят за переход НА СЛЕДУЮЩИЙ тир. У последнего цены нет. */
  price?: BuildPrice | null;
  /** Полная цена списком — если задана, платят ею, а не одиночным price. */
  costs?: BuildCost | null;
  /** Кому позволено этот переход делать. */
  requires?: BuildRequire | null;
};

const asPrice = (raw: unknown): BuildPrice | null => {
  const p = raw as Partial<BuildPrice> | null;
  if (!p || typeof p !== "object") return null;
  const amount = Number(p.amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const kind = p.kind === "likes" || p.kind === "token" ? p.kind : "tickets";
  return { kind, token: kind === "token" ? (p.token ?? null) : null, amount };
};

/**
 * Чем можно платить за стройку: ресурсы маркета плюс ТОВАР из рюкзака героя.
 *
 * Без «item» в этом списке цена-товар молча превращалась в золото (неизвестный
 * вид приводился к нему) — банан оставался в рюкзаке, а списывалась монета.
 */
const COST_RESOURCES: Array<MarketPriceResource | "item"> = [
  "item",
  "tickets",
  "likes",
  "energy",
  "token",
  "gold",
  "stone",
  "wood",
  "diamonds",
];

const asCosts = (raw: unknown, single: BuildPrice | null): BuildCost | null => {
  if (Array.isArray(raw)) {
    const out: BuildCost = [];
    for (const item of raw) {
      const p = (item ?? {}) as Partial<ResourcePrice>;
      const amount = Number(p.amount);
      if (!Number.isFinite(amount) || amount <= 0) continue;
      const resource = COST_RESOURCES.includes(p.resource as MarketPriceResource | "item")
        ? (p.resource as MarketPriceResource | "item")
        : "gold";
      out.push({
        resource,
        token: resource === "token" ? (p.token ?? null) : null,
        // Товар опознаётся ключом стека рюкзака, имя — для показа игроку.
        itemKey: resource === "item" ? (p.itemKey ?? null) : null,
        itemName: resource === "item" ? (p.itemName ?? null) : null,
        amount,
      });
    }
    if (out.length > 0) return out;
  }
  // Старая одиночная цена — та же цена, просто списком из одной строки.
  if (single) {
    return [{ resource: single.kind, token: single.token ?? null, amount: single.amount }];
  }
  return null;
};

const asRequire = (raw: unknown): BuildRequire | null => {
  const r = raw as Partial<BuildRequire> | null;
  if (!r || typeof r !== "object") return null;
  const race = typeof r.race === "string" && r.race.trim() ? r.race.trim() : null;
  const spec = typeof r.spec === "string" && r.spec.trim() ? r.spec.trim() : null;
  return race || spec ? { race, spec } : null;
};

/** Разбор тиров из meta шаблона; мусор отбрасываем. */
export function parseTiers(meta: unknown): BuildingTier[] {
  const raw = (meta as { tiers?: unknown } | null)?.tiers;
  if (!Array.isArray(raw)) return [];
  const out: BuildingTier[] = [];
  for (const t of raw) {
    const o = t as Record<string, unknown>;
    const imageUrl =
      typeof o?.imageUrl === "string" && o.imageUrl.trim() ? o.imageUrl.trim() : null;
    const name =
      typeof o?.name === "string" && o.name.trim() ? o.name.trim() : `Тир ${out.length + 1}`;
    const price = asPrice(o?.price);
    out.push({
      name,
      imageUrl,
      price,
      costs: asCosts(o?.costs, price),
      requires: asRequire(o?.requires),
    });
  }
  return out;
}

export type BuildingTemplate = {
  id: string;
  name: string;
  tiers: BuildingTier[];
};

/** Шаблоны построек, встречающиеся на карте. */
export async function loadBuildingTemplates(mapId: string): Promise<BuildingTemplate[]> {
  const rows = (await mcpExec(
    `SELECT t.id, t.name, t.meta
       FROM yuplink.mystic_item_template t
      WHERE t.kind = 'building'
        AND t.id IN (SELECT DISTINCT building_id FROM yuplink.raid_map_cells
                      WHERE map_id = ${sqlStr(mapId)} AND building_id IS NOT NULL);`,
    { wrapJson: true },
  )) as Array<{ id: string; name: string; meta: unknown }>;
  return (rows ?? []).map((r) => ({ id: r.id, name: r.name, tiers: parseTiers(r.meta) }));
}

/** Текущие тиры построек на карте: "q,r" → номер тира. */
export async function loadBuildingTiers(mapId: string): Promise<Record<string, number>> {
  const rows = (await mcpExec(
    `SELECT q, r, tier FROM yuplink.beta_raid_building_state WHERE map_id = ${sqlStr(mapId)};`,
    { wrapJson: true },
  )) as Array<{ q: number; r: number; tier: number }>;
  const out: Record<string, number> = {};
  for (const r of rows ?? []) out[`${Number(r.q)},${Number(r.r)}`] = Number(r.tier) || 0;
  return out;
}

/** Подходит ли герой под требования тира. Универсал — подходит везде. */
export function heroFits(
  requires: BuildRequire | null | undefined,
  hero: { race: string | null; spec: string | null } | null,
): { ok: boolean; reason?: string } {
  if (!requires) return { ok: true };
  if (!hero) return { ok: false, reason: "Нужен выбранный герой" };
  if (requires.race && hero.race !== requires.race) {
    return { ok: false, reason: `Нужен герой расы «${requires.race}»` };
  }
  // Универсальная спека проходит любой спек-фильтр (общая у common).
  const universalSpec =
    hero.spec == null || /^(универс|universal|все|any)/i.test(String(hero.spec).trim());
  if (requires.spec && !universalSpec && hero.spec !== requires.spec) {
    return { ok: false, reason: `Нужен герой со специализацией «${requires.spec}»` };
  }
  return { ok: true };
}
