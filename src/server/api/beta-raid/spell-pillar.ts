// СТОЛБ ЗАКЛИНАНИЙ: настройка постройки и её витрина.
//
// Постройка сама по себе ничего не решает: цена изучения и список заклинаний
// живут в её настройке (building_config.spellbook, а если у клетки своей нет —
// meta.spellbook шаблона). Тот же приём, что у дерева уровней: одно и то же
// «Древо знания» стоит по-разному в разных местах карты.
//
// Здесь только ЧТЕНИЕ и общий гард «столб рядом и настроен»; изучение — в
// spell-learn.ts, забвение за «Цену забвения» — в spell-forget-pillar.ts.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireBetaRaid } from "./gate";
import { myMapId, playerCell, requireAdjacent } from "./encounter-where";
import { requireNotVoid } from "./voidGate";
import { loadCellBuilding } from "./building-action";
import { isBuilt } from "@/lib/buildingEffect";
import type { ResourcePrice } from "./resource-pay";
import { learnedSpellIds, spellHero, type SpellHero } from "./spell-book";
import { loadSpellTemplates, spellCostFor, type SpellKind } from "./spell-tpl";
import { spellbookSlots } from "@/lib/hero/spellbookSlots";
import { MARKET_PRICE_RESOURCES } from "@/lib/marketItem";
import type { BoostEffect } from "@/lib/hero/boost";

/** Настройка столба: чем платят за изучение и забвение и чему учат. */
export type SpellPillarConfig = {
  learnPrices: ResourcePrice[];
  /** Пусто — у этого столба забыть нельзя (spell.pillar_no_forget). */
  forgetPrices: ResourcePrice[];
  /** Какие заклинания тут дают. Пусто — все активные из каталога. */
  spells: string[];
};

const isResource = (v: unknown): v is ResourcePrice["resource"] =>
  typeof v === "string" && (v === "item" || (MARKET_PRICE_RESOURCES as string[]).includes(v));

/** Цена как её задал админ. Мусор и нули отбрасываем — платить нечем. */
function parsePrices(raw: unknown): ResourcePrice[] {
  if (!Array.isArray(raw)) return [];
  const out: ResourcePrice[] = [];
  for (const item of raw) {
    const p = (item ?? {}) as Partial<ResourcePrice>;
    const resource = isResource(p.resource) ? p.resource : "gold";
    const amount = Number(p.amount);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    out.push({
      resource,
      token: resource === "token" ? (p.token ?? null) : null,
      itemKey: resource === "item" ? (p.itemKey ?? null) : null,
      itemName: resource === "item" ? (p.itemName ?? null) : null,
      amount,
    });
  }
  return out;
}

const section = (raw: unknown): Record<string, unknown> | null => {
  const s = (raw as { spellbook?: unknown } | null)?.spellbook;
  return s && typeof s === "object" ? (s as Record<string, unknown>) : null;
};

/** Настройка ЭТОЙ клетки, а нет своей — настройка шаблона. */
export function spellPillarConfig(cellConfig: unknown, meta: unknown): SpellPillarConfig | null {
  const own = section(cellConfig) ?? section(meta);
  if (!own) return null;
  const ids = Array.isArray(own.spells) ? own.spells : [];
  return {
    learnPrices: parsePrices(own.learnPrices),
    forgetPrices: parsePrices(own.forgetPrices),
    spells: ids.filter((s): s is string => typeof s === "string" && !!s.trim()),
  };
}

const cellInput = (d: unknown) => z.object({ q: z.number().int(), r: z.number().int() }).parse(d);

/** Столб рядом: он есть, достроен и настроен. Иначе — ключ отказа. */
export async function requirePillar(
  wallet: string,
  q: number,
  r: number,
): Promise<{ cfg: SpellPillarConfig } | { reasonKey: string }> {
  const mapId = await myMapId(wallet);
  requireAdjacent(await playerCell(wallet), q, r);
  await requireNotVoid(wallet, mapId, q, r);
  const b = await loadCellBuilding(mapId, q, r);
  if (!b) return { reasonKey: "spell.pillar_not_here" };
  if (!isBuilt(b.tier, b.tiers.length)) return { reasonKey: "spell.pillar_unbuilt" };
  const cfg = spellPillarConfig(b.config, b.meta);
  if (!cfg) return { reasonKey: "spell.pillar_not_here" };
  if (cfg.learnPrices.length === 0) return { reasonKey: "spell.pillar_no_price" };
  return { cfg };
}

export type PillarSpell = {
  id: string;
  name: string;
  description: string;
  image: string | null;
  kind: SpellKind;
  effects: BoostEffect[];
  minInt: number;
  baseEnergyCost: number;
  baseCooldownMinutes: number;
  /** Цена и откат для ЭТОГО героя — чтобы видеть, что даст интеллект. */
  energyCost: number;
  cooldownMinutes: number;
  learned: boolean;
  canLearn: boolean;
  reasonKey: string | null;
  reasonParams?: Record<string, string | number>;
};

export type PillarOffer = {
  hero: SpellHero | null;
  slots: { total: number; used: number; free: number };
  learnPrices: ResourcePrice[];
  forgetPrices: ResourcePrice[];
  spells: PillarSpell[];
  reasonKey: string | null;
};

const EMPTY: PillarOffer = {
  hero: null,
  slots: { total: 0, used: 0, free: 0 },
  learnPrices: [],
  forgetPrices: [],
  spells: [],
  reasonKey: null,
};

/** Что предлагает столб: каталог, цены и сколько мест осталось в книге. */
export const getSpellPillarOffer = createServerFn({ method: "GET" })
  .inputValidator(cellInput)
  .handler(async ({ data }): Promise<PillarOffer> => {
    const wallet = await requireBetaRaid();
    const gate = await requirePillar(wallet, data.q, data.r);
    if ("reasonKey" in gate) return { ...EMPTY, reasonKey: gate.reasonKey };

    const hero = await spellHero(wallet);
    if (!hero) return { ...EMPTY, ...priceView(gate.cfg), reasonKey: "spell.no_hero" };

    const [known, catalog] = await Promise.all([
      learnedSpellIds(hero.heroId),
      loadSpellTemplates(gate.cfg.spells.length > 0 ? { ids: gate.cfg.spells } : {}),
    ]);
    const total = spellbookSlots({ spec: hero.spec, rarity: hero.rarity });
    const free = Math.max(0, total - known.length);
    return {
      hero,
      slots: { total, used: known.length, free },
      ...priceView(gate.cfg),
      reasonKey: null,
      spells: catalog.map((tpl) => {
        const cost = spellCostFor(tpl, hero.intellect);
        const learned = known.includes(tpl.id);
        // Порядок отказов тот же, что при самом изучении (learnSpell), иначе
        // кнопка гасла бы по одной причине, а сервер отвечал бы другой.
        const refusal: {
          reasonKey: string;
          reasonParams?: Record<string, string | number>;
        } | null = learned
          ? { reasonKey: "spell.already_learned" }
          : hero.intellect < tpl.minInt
            ? { reasonKey: "spell.low_int", reasonParams: { need: tpl.minInt } }
            : free <= 0
              ? { reasonKey: "spell.no_slots", reasonParams: { total } }
              : null;
        return {
          id: tpl.id,
          name: tpl.name,
          description: tpl.description,
          image: tpl.image,
          kind: tpl.kind,
          effects: tpl.effects,
          minInt: tpl.minInt,
          baseEnergyCost: tpl.energyCost,
          baseCooldownMinutes: tpl.cooldownMinutes,
          energyCost: cost.energy,
          cooldownMinutes: cost.cooldownMinutes,
          learned,
          canLearn: !refusal,
          reasonKey: refusal?.reasonKey ?? null,
          ...(refusal?.reasonParams ? { reasonParams: refusal.reasonParams } : {}),
        };
      }),
    };
  });

// forgetPrices — всегда массив: вкладка любой сборки читает его .length.
const priceView = (cfg: SpellPillarConfig) => ({
  learnPrices: cfg.learnPrices,
  forgetPrices: cfg.forgetPrices,
});
