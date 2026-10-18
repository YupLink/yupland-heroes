// Информация о предмете для «i» в маркете и любом месте, где нужны детали.
//
// Публично, без гейта: игрок всё равно видит имя, картинку и цену — а поля
// вроде «раса/специализация/иммунитеты/уровень/редкость» дают ему решить,
// стоит ли покупать. То же, что админ видит в редакторе предмета, но только
// нужное покупателю: без служебных флажков.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { bossBrief, customBrief } from "./item-info-extra";
import type { AbilityCfg } from "./abilities";
import type { BoostEffect } from "@/lib/hero/boost";

export type ItemInfo = {
  id: string;
  kind: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  rarity: string | null;
  level: number | null;
  race: string | null;
  specialization: string | null;
  land: string | null;
  statType: string | null;
  statAmount: number | null;
  /** Прибавка «на своей земле» — если совпала земля героя. */
  landAmount: number | null;
  /** Прибавка «своей расе». */
  raceAmount: number | null;
  /** Прибавка «своей специализации». */
  specAmount: number | null;
  immunities: string[];
  slot: string | null;
  /** Бонус к рыбалке, % к базе шанса (артефакт). 0 — нет. */
  fishBonusPct?: number | null;
  /** Только у боссов: запас здоровья, разброс урона и способности. */
  hp: number | null;
  damage: string | null;
  abilities: AbilityCfg[];
  /** Товар-буст: что даст герою. Пусто — обычный предмет, о бустах молчим. */
  boost?: BoostEffect[] | null;
};

/** Пустая карточка: заполняем только то, что источник реально знает. */
const blank = (id: string, kind: string): ItemInfo => ({
  id,
  kind,
  name: "",
  description: null,
  imageUrl: null,
  rarity: null,
  level: null,
  race: null,
  specialization: null,
  land: null,
  statType: null,
  statAmount: null,
  landAmount: null,
  raceAmount: null,
  specAmount: null,
  immunities: [],
  slot: null,
  hp: null,
  damage: null,
  abilities: [],
});

export const getItemInfo = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ id: z.string().min(1) }).parse(d))
  .handler(async ({ data }): Promise<ItemInfo | null> => {
    const rows = (await mcpExec(
      `SELECT id, kind, name, description, image_url, rarity, level, race, specialization,
              land, stat_type, stat_amount, land_amount, race_amount, spec_amount,
              immunities, slot, fish_bonus_pct
         FROM yuplink.mystic_item_template WHERE id = ${sqlStr(data.id)} LIMIT 1;`,
      { wrapJson: true },
    )) as Array<Record<string, unknown>>;
    const r = rows?.[0];
    // Справочник артефактов знает не всё: босса и свой товар держат свои
    // таблицы. Раньше на них шторка открывалась пустой.
    if (!r) {
      const id = data.id;
      if (id.startsWith("rbt_")) {
        const b = await bossBrief(id);
        return b ? { ...blank(id, "boss"), ...b } : null;
      }
      if (id.startsWith("cst_")) {
        const c = await customBrief(id);
        return c ? { ...blank(id, "custom"), ...c } : null;
      }
      return null;
    }
    const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
    return {
      id: String(r.id),
      kind: String(r.kind),
      name: String(r.name ?? ""),
      description: r.description ? String(r.description) : null,
      imageUrl: r.image_url ? String(r.image_url) : null,
      rarity: r.rarity ? String(r.rarity) : null,
      level: num(r.level),
      race: r.race ? String(r.race) : null,
      specialization: r.specialization ? String(r.specialization) : null,
      land: r.land ? String(r.land) : null,
      statType: r.stat_type ? String(r.stat_type) : null,
      statAmount: num(r.stat_amount),
      landAmount: num(r.land_amount),
      raceAmount: num(r.race_amount),
      specAmount: num(r.spec_amount),
      immunities: Array.isArray(r.immunities) ? (r.immunities as string[]).map(String) : [],
      slot: r.slot ? String(r.slot) : null,
      fishBonusPct: Number(r.fish_bonus_pct) || 0,
      hp: null,
      damage: null,
      abilities: [],
    };
  });
