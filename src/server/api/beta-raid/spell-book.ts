import { z } from "zod";
import { loadOwnedHero } from "./hero-load";
import { buildHeroPower, heroPowerEnabled } from "./hero-power";
import { loadBuffsFor, buffHero } from "./hero-buff";
import { loadWeakenFor, weakenHero } from "./hero-weaken";
// КНИГА заклинаний героя: что выучено, сколько мест и что на откате.
//
// Книга принадлежит ГЕРОЮ, а не игроку: сменил основного героя — открылась
// другая книга, со своими местами. То же и с ОТКАТОМ — 14.09 владелец
// сменил решение: разные герои — независимые заклинания и независимые
// кулдауны, каждый герой собирает и читает свои.
//
// Откат хранится АБСОЛЮТНЫМ моментом готовности (hero_spell_cd.ready_at):
// скидка от интеллекта фиксируется в миг каста и потом не пересматривается.
// Считай мы откат на лету от времени каста — снятый артефакт удлинял бы уже
// запущенный откат, а надетый укорачивал бы его задним числом.
import { createServerFn } from "@tanstack/react-start";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { requireBetaRaid } from "./gate";
import { raidOwner } from "./owner";
import { loadHeroView } from "./hero-power";
import { spellCostFor, spellTemplateMap, type SpellKind, type SpellTpl } from "./spell-tpl";
import { spellbookSlots } from "@/lib/hero/spellbookSlots";
import { spellDiscountPercent } from "@/lib/hero/spellPower";
import type { BoostEffect } from "@/lib/hero/boost";

/** Герой, которому принадлежит книга. Интеллект — уже с баффами и минусами. */
export type SpellHero = {
  heroId: string;
  name: string;
  spec: string | null;
  rarity: string;
  intellect: number;
};

export type SpellBookEntry = {
  id: string;
  name: string;
  description: string;
  image: string | null;
  kind: SpellKind;
  effects: BoostEffect[];
  /** Цена и откат ДЛЯ ЭТОГО героя (со скидкой от интеллекта). */
  energyCost: number;
  cooldownMinutes: number;
  /** Полные значения шаблона — чтобы книга могла показать «было/стало». */
  baseEnergyCost: number;
  baseCooldownMinutes: number;
  minInt: number;
  active: boolean;
  /** Когда заклинание снова готово (ISO) и сколько секунд ждать. */
  readyAt: string | null;
  cooldownLeftSec: number;
  canCast: boolean;
  /** Причина отказа — ключом словаря: сервер не знает язык игрока. */
  reasonKey: string | null;
  reasonParams?: Record<string, string | number>;
};

export type SpellBookView = {
  hero: SpellHero | null;
  slots: { total: number; used: number; free: number };
  /** Скидка от интеллекта в процентах — её книга показывает строкой. */
  discountPercent: number;
  spells: SpellBookEntry[];
};

/**
 * Герой для книги. Берём общий кэш силы героя (loadHeroView): там интеллект уже
 * с надетым, баффами и ослаблениями босса — ровно то число, по которому считает
 * скидку клиент. Своего расчёта здесь нет намеренно, иначе цена в книге и цена
 * при касте разъехались бы.
 */
export async function spellHero(wallet: string): Promise<SpellHero | null> {
  const view = await loadHeroView(wallet).catch(() => null);
  if (!view) return null;
  const info = view.info;
  return {
    heroId: info.heroId,
    name: info.name,
    spec: info.spec,
    rarity: info.rarity,
    intellect: Math.max(0, Math.floor(Number(info.stats.int) || 0)),
  };
}

/** Что герой знает: id заклинаний в порядке изучения. */
export async function learnedSpellIds(heroId: string, strict = false): Promise<string[]> {
  const rows = (await mcpExec(
    `SELECT spell_id FROM yuplink.hero_spellbook
      WHERE hero_id = ${sqlStr(heroId)} ORDER BY learned_at;`,
    { wrapJson: true },
  ).catch((error) => {
    if (strict) throw error;
    return [];
  })) as Array<{ spell_id: string }>;
  return (rows ?? []).map((r) => String(r.spell_id));
}

/**
 * Когда каждое заклинание снова готово: заклинание → ready_at (ISO).
 * Ключ — hero_instance.id: у каждого героя свои откаты.
 */
export async function spellReadyAt(heroId: string, strict = false): Promise<Map<string, string>> {
  const rows = (await mcpExec(
    `SELECT spell_id, ready_at FROM yuplink.hero_spell_cd
      WHERE hero_id = ${sqlStr(heroId)} AND ready_at > now();`,
    { wrapJson: true },
  ).catch((error) => {
    if (strict) throw error;
    return [];
  })) as Array<{ spell_id: string; ready_at: string }>;
  return new Map((rows ?? []).map((r) => [String(r.spell_id), String(r.ready_at)]));
}

/** Сколько секунд отката осталось. 0 — заклинание готово. */
export function cooldownLeftSec(readyAt: string | null | undefined): number {
  if (!readyAt) return 0;
  const ready = Date.parse(readyAt);
  if (!Number.isFinite(ready)) return 0;
  const left = Math.ceil((ready - Date.now()) / 1000);
  return left > 0 ? left : 0;
}

/** Готово ли заклинание и почему нет. Одно правило на книгу и на каст. */
export function castRefusal(
  tpl: SpellTpl,
  hero: SpellHero,
  leftSec: number,
): { reasonKey: string; reasonParams?: Record<string, string | number> } | null {
  if (!tpl.active) return { reasonKey: "spell.unknown" };
  if (hero.intellect < tpl.minInt)
    return { reasonKey: "spell.low_int", reasonParams: { need: tpl.minInt } };
  if (leftSec > 0) return { reasonKey: "spell.cooldown", reasonParams: { sec: leftSec } };
  return null;
}

function entryOf(tpl: SpellTpl, hero: SpellHero, readyAt: string | undefined): SpellBookEntry {
  const cost = spellCostFor(tpl, hero.intellect);
  const leftSec = cooldownLeftSec(readyAt);
  const refusal = castRefusal(tpl, hero, leftSec);
  return {
    id: tpl.id,
    name: tpl.name,
    description: tpl.description,
    image: tpl.image,
    kind: tpl.kind,
    effects: tpl.effects,
    energyCost: cost.energy,
    cooldownMinutes: cost.cooldownMinutes,
    baseEnergyCost: tpl.energyCost,
    baseCooldownMinutes: tpl.cooldownMinutes,
    minInt: tpl.minInt,
    active: tpl.active,
    readyAt: leftSec > 0 ? (readyAt ?? null) : null,
    cooldownLeftSec: leftSec,
    canCast: !refusal,
    reasonKey: refusal?.reasonKey ?? null,
    ...(refusal?.reasonParams ? { reasonParams: refusal.reasonParams } : {}),
  };
}

/** Книга целиком. Героя нет — пустая книга без мест, а не ошибка. */
export async function spellBookOf(wallet: string): Promise<SpellBookView> {
  const hero = await spellHero(wallet);
  if (!hero) {
    return { hero: null, slots: { total: 0, used: 0, free: 0 }, discountPercent: 0, spells: [] };
  }
  return spellBookFor(hero);
}

/** Assemble the book and cooldowns for the same, already-authorized hero. */
async function spellBookFor(hero: SpellHero, strict = false): Promise<SpellBookView> {
  const known = await learnedSpellIds(hero.heroId, strict);
  // Шаблоны и откаты не знают друг о друге — тянем разом, а не цепочкой.
  const [tpls, cds] = await Promise.all([
    spellTemplateMap(known),
    known.length > 0
      ? spellReadyAt(hero.heroId, strict)
      : Promise.resolve(new Map<string, string>()),
  ]);
  const total = spellbookSlots({ spec: hero.spec, rarity: hero.rarity });
  // Шаблон могли удалить из каталога — выученная строка тогда просто исчезает
  // из книги, но МЕСТО держит: считаем занятые по строкам книги, а не по
  // найденным шаблонам, иначе удаление шаблона тихо раздавало бы места.
  const used = known.length;
  return {
    hero,
    slots: { total, used, free: Math.max(0, total - used) },
    discountPercent: spellDiscountPercent(hero.intellect),
    spells: known
      .map((id) => {
        const tpl = tpls.get(id);
        return tpl ? entryOf(tpl, hero, cds.get(id)) : null;
      })
      .filter((e): e is SpellBookEntry => e !== null),
  };
}

export const getHeroSpellbook = createServerFn({ method: "GET" }).handler(
  async (): Promise<SpellBookView> => spellBookOf(await requireBetaRaid()),
);

/** Read an owned hero's existing book. No selection, learning or casting. */
export const getOwnedHeroSpellbook = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ heroId: z.string().trim().min(1) }).parse(d))
  .handler(async ({ data }): Promise<SpellBookView> => {
    const wallet = await requireBetaRaid();
    if (!(await heroPowerEnabled(wallet))) throw new Error("Hero spellbook unavailable");
    const hero = await loadOwnedHero(wallet, data.heroId);
    const [buffs, weaken] = await Promise.all([loadBuffsFor(wallet), loadWeakenFor(wallet)]);
    const info = weakenHero(buffHero(buildHeroPower(hero).info, buffs), weaken);
    return spellBookFor(
      {
        heroId: hero.heroId,
        name: hero.name,
        spec: hero.spec,
        rarity: hero.rarity,
        intellect: Math.max(0, Math.floor(Number(info.stats.int) || 0)),
      },
      true,
    );
  });
